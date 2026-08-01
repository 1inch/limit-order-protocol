#!/usr/bin/env python3
"""
validate_prd.py — Validate structural completeness and confidence distribution of a
reverse-engineered PRD.

Usage:
    python validate_prd.py <path-to-prd.md>
    python validate_prd.py <path-to-prd.md> --verbose
    python validate_prd.py <path-to-prd.md> --json

Exit codes:
    0 — PASS (score >= 80, no blocking issues)
    1 — FAIL (score < 80 or blocking issues found)
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class Issue:
    """A single validation finding."""

    severity: str  # "error" | "warning" | "info"
    category: str
    message: str
    line: int = 0


@dataclass
class ValidationReport:
    """Aggregated validation result for a PRD."""

    path: str
    issues: list[Issue] = field(default_factory=list)
    score: int = 100
    verified_count: int = 0
    inferred_count: int = 0
    total_requirements: int = 0

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]

    @property
    def passed(self) -> bool:
        return len(self.errors) == 0 and self.score >= 80


# ---------------------------------------------------------------------------
# Required sections
# ---------------------------------------------------------------------------

REQUIRED_SECTIONS = [
    ("Product Overview", r"^#{1,3}\s+Product Overview", "error"),
    ("Functional Requirements", r"^#{1,3}\s+Functional Requirements", "error"),
    ("Scope Boundary", r"^#{1,3}\s+Scope Boundary", "error"),
    ("Undetermined Items", r"^#{1,3}\s+Undetermined Items", "error"),
    ("User Personas", r"^#{1,3}\s+User Personas", "warning"),
    ("Non-Functional Requirements", r"^#{1,3}\s+Non.Functional Requirements", "warning"),
]


# ---------------------------------------------------------------------------
# Secret pattern detection (basic heuristics)
# ---------------------------------------------------------------------------

SECRET_PATTERNS = [
    (r'(?i)(password|passwd|pwd)\s*[:=]\s*["\']?[^\s"\'<>]{8,}', "potential password"),
    (r'(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']?[A-Za-z0-9_\-]{20,}', "potential API key"),
    (r'(?i)(secret|token)\s*[:=]\s*["\']?[A-Za-z0-9_\-]{20,}', "potential secret/token"),
    (r'(?i)bearer\s+[A-Za-z0-9\-._~+/]{20,}', "potential bearer token"),
    (r'[A-Za-z0-9]{32,}(?=[^A-Za-z0-9]|$)', "long random string (possible secret)"),
]


# ---------------------------------------------------------------------------
# Core validation functions
# ---------------------------------------------------------------------------


def check_required_sections(lines: list[str], report: ValidationReport) -> None:
    """Verify all required sections exist."""
    content = "\n".join(lines)
    for section_name, pattern, severity in REQUIRED_SECTIONS:
        if not re.search(pattern, content, re.MULTILINE):
            report.issues.append(
                Issue(
                    severity=severity,
                    category="structure",
                    message=f"Missing required section: '{section_name}'",
                )
            )
            if severity == "error":
                report.score -= 15
            else:
                report.score -= 5


def check_placeholder_markers(lines: list[str], report: ValidationReport) -> None:
    """Detect unfilled placeholder text."""
    placeholder_pattern = re.compile(
        r"\[TODO\b|\[PLACEHOLDER\b|\[TBD\b|\[FILL\b|\[INSERT\b",
        re.IGNORECASE,
    )
    for i, line in enumerate(lines, 1):
        if placeholder_pattern.search(line):
            report.issues.append(
                Issue(
                    severity="error",
                    category="completeness",
                    message=f"Unfilled placeholder marker found",
                    line=i,
                )
            )
            report.score -= 5


def check_confidence_tags(lines: list[str], report: ValidationReport) -> None:
    """
    Count Verified vs Inferred requirements and check the distribution.

    A core requirement is any line containing 'REQ-NNN:' (definition line).
    Prose references to REQ-NNN (without the colon) are not counted.
    """
    content = "\n".join(lines)

    # Count unique REQ-NNN: definition lines (the colon distinguishes definitions from prose refs)
    req_ids = re.findall(r"\bREQ-(\d{3,}):", content)
    report.total_requirements = len(set(req_ids))  # unique definitions only

    if report.total_requirements == 0:
        report.issues.append(
            Issue(
                severity="warning",
                category="confidence",
                message="No requirement IDs found (REQ-NNN format). Confidence distribution cannot be checked.",
            )
        )
        return

    # Count confidence tags
    verified_matches = re.findall(r"\[Verified\]", content, re.IGNORECASE)
    inferred_matches = re.findall(r"\[Inferred:", content, re.IGNORECASE)

    report.verified_count = len(verified_matches)
    report.inferred_count = len(inferred_matches)

    tagged_count = report.verified_count + report.inferred_count
    untagged_count = report.total_requirements - tagged_count

    if untagged_count > 0:
        report.issues.append(
            Issue(
                severity="warning",
                category="confidence",
                message=(
                    f"{untagged_count} requirement(s) lack a confidence tag "
                    f"([Verified] or [Inferred: ...]). Every REQ-NNN must have one."
                ),
            )
        )
        report.score -= min(untagged_count * 3, 15)

    # Quality gate: Verified must be >= 80% of total
    if report.total_requirements > 0:
        verified_pct = (report.verified_count / report.total_requirements) * 100
        if verified_pct < 80:
            shortfall = 80 - verified_pct
            report.issues.append(
                Issue(
                    severity="error",
                    category="confidence",
                    message=(
                        f"Quality gate failed: only {verified_pct:.1f}% of requirements are "
                        f"[Verified] ({report.verified_count}/{report.total_requirements}). "
                        f"Minimum is 80%. Need {int(shortfall * report.total_requirements / 100) + 1} "
                        f"more verified requirements."
                    ),
                )
            )
            report.score -= int(shortfall * 0.5)

        inferred_pct = (report.inferred_count / report.total_requirements) * 100
        if inferred_pct > 15:
            report.issues.append(
                Issue(
                    severity="warning",
                    category="confidence",
                    message=(
                        f"[Inferred] requirements ({inferred_pct:.1f}%) exceed the 15% threshold. "
                        f"Reduce by moving excess items to Undetermined Items."
                    ),
                )
            )
            report.score -= 5


def check_requirement_id_sequence(lines: list[str], report: ValidationReport) -> None:
    """Verify requirement IDs are sequential (REQ-001, REQ-002, ...).

    Only counts 'REQ-NNN:' definition lines — prose references (without colon) are excluded.
    """
    content = "\n".join(lines)
    # Match only definition lines: REQ-NNN: followed by text
    all_def_ids = [int(m) for m in re.findall(r"\bREQ-(\d{3,}):", content)]

    if not all_def_ids:
        return

    # Check for duplicates among definitions
    from collections import Counter
    id_counts = Counter(all_def_ids)
    dupes = [f"REQ-{n:03d}" for n, count in id_counts.items() if count > 1]
    if dupes:
        report.issues.append(
            Issue(
                severity="error",
                category="structure",
                message=f"Duplicate requirement IDs found: {dupes}",
            )
        )
        report.score -= 10

    ids_sorted = sorted(set(all_def_ids))
    expected = list(range(1, len(ids_sorted) + 1))

    if ids_sorted != expected:
        missing = [n for n in expected if n not in ids_sorted]
        extra = [n for n in ids_sorted if n not in expected]
        problems = []
        if missing:
            problems.append(f"missing: {[f'REQ-{n:03d}' for n in missing[:5]]}")
        if extra:
            problems.append(f"unexpected: {[f'REQ-{n:03d}' for n in extra[:5]]}")
        report.issues.append(
            Issue(
                severity="warning",
                category="structure",
                message=f"Requirement IDs are not sequential. {'; '.join(problems)}",
            )
        )
        report.score -= 3


def check_mermaid_blocks(lines: list[str], report: ValidationReport) -> None:
    """Basic syntax check on mermaid diagram blocks."""
    in_mermaid = False
    block_start_line = 0
    open_blocks = 0

    valid_diagram_types = {
        "graph", "flowchart", "sequenceDiagram", "classDiagram",
        "stateDiagram", "erDiagram", "gantt", "pie", "mindmap", "journey",
    }

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        if stripped == "```mermaid":
            in_mermaid = True
            block_start_line = i
            open_blocks += 1
            continue

        if in_mermaid and stripped == "```":
            in_mermaid = False
            open_blocks -= 1
            continue

        if in_mermaid and block_start_line == i - 1:
            # First line of mermaid block should be a valid diagram type
            diagram_type = stripped.split()[0] if stripped else ""
            if diagram_type not in valid_diagram_types and diagram_type:
                report.issues.append(
                    Issue(
                        severity="warning",
                        category="diagrams",
                        message=(
                            f"Mermaid block at line {block_start_line} starts with "
                            f"unrecognized diagram type: '{diagram_type}'"
                        ),
                        line=block_start_line,
                    )
                )

    if open_blocks != 0:
        report.issues.append(
            Issue(
                severity="error",
                category="diagrams",
                message="Unclosed mermaid code block detected.",
            )
        )
        report.score -= 5


def check_secrets(lines: list[str], report: ValidationReport) -> None:
    """Scan for patterns that look like credentials or secrets."""
    for i, line in enumerate(lines, 1):
        # Skip lines that are clearly code evidence citations (file paths)
        if line.strip().startswith("-") and ".ts" in line or ".py" in line or ".go" in line:
            continue

        for pattern, label in SECRET_PATTERNS:
            if re.search(pattern, line):
                report.issues.append(
                    Issue(
                        severity="warning",
                        category="security",
                        message=f"Possible {label} detected — review before sharing",
                        line=i,
                    )
                )
                report.score -= 5
                break  # One warning per line is enough


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------


def render_text(report: ValidationReport, verbose: bool = False) -> str:
    """Render the validation report as human-readable text."""
    lines = []
    status = "PASS" if report.passed else "FAIL"
    lines.append(f"{'=' * 60}")
    lines.append(f"PRD Validation: {status}")
    lines.append(f"File: {report.path}")
    lines.append(f"Score: {max(0, report.score)}/100")

    if report.total_requirements > 0:
        verified_pct = (report.verified_count / report.total_requirements) * 100
        lines.append(
            f"Requirements: {report.total_requirements} total | "
            f"{report.verified_count} Verified ({verified_pct:.1f}%) | "
            f"{report.inferred_count} Inferred"
        )

    lines.append(f"{'=' * 60}")

    if report.errors:
        lines.append(f"\nERRORS ({len(report.errors)}):")
        for issue in report.errors:
            loc = f" [line {issue.line}]" if issue.line else ""
            lines.append(f"  [ERROR] [{issue.category}]{loc} {issue.message}")

    if report.warnings:
        lines.append(f"\nWARNINGS ({len(report.warnings)}):")
        for issue in report.warnings:
            loc = f" [line {issue.line}]" if issue.line else ""
            lines.append(f"  [WARN]  [{issue.category}]{loc} {issue.message}")

    if not report.issues:
        lines.append("\nNo issues found.")

    if verbose and report.total_requirements > 0:
        lines.append(f"\nConfidence Distribution:")
        lines.append(f"  Verified:  {report.verified_count}")
        lines.append(f"  Inferred:  {report.inferred_count}")
        lines.append(f"  Untagged:  {report.total_requirements - report.verified_count - report.inferred_count}")
        lines.append(f"  Total REQ: {report.total_requirements}")

    return "\n".join(lines)


def render_json(report: ValidationReport) -> str:
    """Render the validation report as JSON."""
    data = {
        "path": report.path,
        "passed": report.passed,
        "score": max(0, report.score),
        "requirements": {
            "total": report.total_requirements,
            "verified": report.verified_count,
            "inferred": report.inferred_count,
            "verified_pct": (
                round(report.verified_count / report.total_requirements * 100, 1)
                if report.total_requirements > 0
                else None
            ),
        },
        "issues": [
            {
                "severity": i.severity,
                "category": i.category,
                "message": i.message,
                "line": i.line or None,
            }
            for i in report.issues
        ],
        "error_count": len(report.errors),
        "warning_count": len(report.warnings),
    }
    return json.dumps(data, indent=2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def validate_prd(path: Path) -> ValidationReport:
    """Run all checks on a PRD file and return the aggregated report."""
    report = ValidationReport(path=str(path))

    if not path.exists():
        report.issues.append(
            Issue(severity="error", category="io", message=f"File not found: {path}")
        )
        report.score = 0
        return report

    if not path.is_file():
        report.issues.append(
            Issue(severity="error", category="io", message=f"Path is not a file: {path}")
        )
        report.score = 0
        return report

    try:
        content = path.read_text(encoding="utf-8")
    except Exception as exc:
        report.issues.append(
            Issue(severity="error", category="io", message=f"Cannot read file: {exc}")
        )
        report.score = 0
        return report

    lines = content.splitlines()

    check_required_sections(lines, report)
    check_placeholder_markers(lines, report)
    check_confidence_tags(lines, report)
    check_requirement_id_sequence(lines, report)
    check_mermaid_blocks(lines, report)
    check_secrets(lines, report)

    report.score = max(0, report.score)
    return report


def main() -> int:
    """Entry point."""
    parser = argparse.ArgumentParser(
        description="Validate a reverse-engineered PRD for structural completeness and confidence distribution.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("prd_path", help="Path to the PRD markdown file")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show additional detail")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    path = Path(args.prd_path)
    report = validate_prd(path)

    if args.json:
        print(render_json(report))
    else:
        print(render_text(report, verbose=args.verbose))

    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
