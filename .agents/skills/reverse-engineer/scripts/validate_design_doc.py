#!/usr/bin/env python3
"""
validate_design_doc.py — Validate structural completeness of a reverse-engineered
technical design document.

Usage:
    python validate_design_doc.py <path-to-design-doc.md>
    python validate_design_doc.py <path-to-design-doc.md> --verbose
    python validate_design_doc.py <path-to-design-doc.md> --json
    python validate_design_doc.py <path-to-design-doc.md> --repo-root /path/to/repo

Exit codes:
    0 — PASS (score >= 70, no blocking errors)
    1 — FAIL (score < 70 or blocking errors found)
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
    """Aggregated validation result for a design doc."""

    path: str
    issues: list[Issue] = field(default_factory=list)
    score: int = 100

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]

    @property
    def passed(self) -> bool:
        return len(self.errors) == 0 and self.score >= 70


# ---------------------------------------------------------------------------
# Required sections
# ---------------------------------------------------------------------------

REQUIRED_SECTIONS = [
    ("System Overview", r"^#{1,3}\s+System Overview", "error"),
    ("Architecture", r"^#{1,3}\s+Architecture", "error"),
    ("Components", r"^#{1,3}\s+Components?", "error"),
    ("Data Model", r"^#{1,3}\s+Data Model", "error"),
    ("API Surface", r"^#{1,3}\s+API Surface", "warning"),
    ("Integration Points", r"^#{1,3}\s+Integration Points?", "warning"),
    ("Deployment", r"^#{1,3}\s+Deployment", "warning"),
    ("Cross-Cutting Concerns", r"^#{1,3}\s+Cross.Cutting Concerns?", "warning"),
]

# Component subsection must have these sub-subsections (within a component block)
COMPONENT_REQUIRED_SUBSECTIONS = ["Responsibilities", "Interfaces", "Dependencies"]


# ---------------------------------------------------------------------------
# Secret pattern detection
# ---------------------------------------------------------------------------

SECRET_PATTERNS = [
    (r'(?i)(password|passwd|pwd)\s*[:=]\s*["\']?[^\s"\'<>]{8,}', "potential password"),
    (r'(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']?[A-Za-z0-9_\-]{20,}', "potential API key"),
    (r'(?i)(secret|token)\s*[:=]\s*["\']?[A-Za-z0-9_\-]{20,}', "potential secret/token"),
    (r'(?i)bearer\s+[A-Za-z0-9\-._~+/]{20,}', "potential bearer token"),
]


# ---------------------------------------------------------------------------
# Validation functions
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


def check_component_descriptions(lines: list[str], report: ValidationReport) -> None:
    """
    Each Component subsection must have Responsibilities and Interfaces sub-subsections.

    Detects '### Component: ...' headers and checks that the block contains
    the required sub-sections before the next '###' or '##' heading.
    """
    content = "\n".join(lines)

    # Find all component headings
    component_pattern = re.compile(
        r"^#{2,4}\s+Component:\s+(.+)$", re.MULTILINE | re.IGNORECASE
    )
    component_matches = list(component_pattern.finditer(content))

    if not component_matches:
        # No components defined — check if a Components section exists at all
        if re.search(r"^#{1,3}\s+Components?", content, re.MULTILINE):
            report.issues.append(
                Issue(
                    severity="warning",
                    category="components",
                    message=(
                        "Components section found but no 'Component: [Name]' subsections detected. "
                        "Each component should be its own '### Component: [Name]' block."
                    ),
                )
            )
            report.score -= 5
        return

    # Check each component block for required subsections
    for i, match in enumerate(component_matches):
        component_name = match.group(1).strip()
        block_start = match.end()

        # Find the end of this component's block (next heading of same or higher level)
        if i + 1 < len(component_matches):
            block_end = component_matches[i + 1].start()
        else:
            block_end = len(content)

        block = content[block_start:block_end]

        for required_sub in COMPONENT_REQUIRED_SUBSECTIONS:
            if not re.search(
                rf"(^|\n)\s*\*{re.escape(required_sub)}\*\s*:|^#{2,5}\s+{re.escape(required_sub)}",
                block,
                re.MULTILINE | re.IGNORECASE,
            ):
                report.issues.append(
                    Issue(
                        severity="warning",
                        category="components",
                        message=(
                            f"Component '{component_name}' is missing "
                            f"'{required_sub}' description"
                        ),
                    )
                )
                report.score -= 3


def check_file_references(
    lines: list[str], report: ValidationReport, repo_root: Path | None
) -> None:
    """
    Spot-check file references: lines containing backtick-wrapped paths
    that look like source file paths.

    Only checks a sample (first 10 unique paths) to avoid false positives
    from placeholder paths. Reports as info/warning, not error.
    """
    if repo_root is None:
        return  # Can't check without a repo root

    # Find backtick-wrapped paths that look like code file paths
    path_pattern = re.compile(r"`([^`]+\.(ts|js|py|go|rb|rs|java|kt|cs|cpp|c|h|tsx|jsx|vue))`")
    found_paths = []
    for i, line in enumerate(lines, 1):
        for match in path_pattern.finditer(line):
            found_paths.append((match.group(1), i))

    checked = 0
    for file_path_str, line_num in found_paths[:10]:
        # Clean the path (remove leading ./ or /)
        clean_path = file_path_str.lstrip("./")
        candidate = repo_root / clean_path
        if not candidate.exists():
            report.issues.append(
                Issue(
                    severity="warning",
                    category="file-references",
                    message=(
                        f"Referenced file not found: `{file_path_str}` "
                        f"(checked: {candidate})"
                    ),
                    line=line_num,
                )
            )
            report.score -= 2
        checked += 1

    if checked == 0 and len(found_paths) == 0:
        report.issues.append(
            Issue(
                severity="info",
                category="file-references",
                message="No file references found in the document. Consider adding evidence paths.",
            )
        )


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
                    message="Unfilled placeholder marker found",
                    line=i,
                )
            )
            report.score -= 5


def check_mermaid_blocks(lines: list[str], report: ValidationReport) -> None:
    """Basic syntax check on mermaid diagram blocks."""
    in_mermaid = False
    block_start_line = 0
    open_blocks = 0

    valid_diagram_types = {
        "graph", "flowchart", "sequenceDiagram", "classDiagram",
        "stateDiagram", "erDiagram", "gantt", "pie", "mindmap", "journey",
        "stateDiagram-v2", "C4Context", "C4Container", "C4Component",
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

        if in_mermaid and i == block_start_line + 1:
            diagram_type = stripped.split()[0] if stripped else ""
            if diagram_type and diagram_type not in valid_diagram_types:
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


def check_architecture_diagrams(lines: list[str], report: ValidationReport) -> None:
    """Warn if no diagrams are present in the Architecture section."""
    content = "\n".join(lines)

    # Find Architecture section
    arch_match = re.search(r"^#{1,3}\s+Architecture\b", content, re.MULTILINE)
    if not arch_match:
        return  # Already reported as missing section

    # Find the end of Architecture section (next section at same or higher level)
    arch_heading_level = len(re.match(r"^(#+)", content[arch_match.start():]).group(1))
    next_section_pattern = re.compile(
        rf"^#{{1,{arch_heading_level}}}\s+\w", re.MULTILINE
    )
    next_match = next_section_pattern.search(content, arch_match.end())
    arch_end = next_match.start() if next_match else len(content)
    arch_block = content[arch_match.end():arch_end]

    if "```mermaid" not in arch_block and "![" not in arch_block:
        report.issues.append(
            Issue(
                severity="warning",
                category="diagrams",
                message=(
                    "Architecture section contains no diagrams (mermaid or image). "
                    "Consider generating C4 diagrams using /c4-architecture or adding inline mermaid."
                ),
            )
        )
        report.score -= 5


def check_secrets(lines: list[str], report: ValidationReport) -> None:
    """Scan for patterns that look like credentials or secrets."""
    for i, line in enumerate(lines, 1):
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
                break


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------


def render_text(report: ValidationReport, verbose: bool = False) -> str:
    """Render the validation report as human-readable text."""
    lines_out = []
    status = "PASS" if report.passed else "FAIL"
    lines_out.append(f"{'=' * 60}")
    lines_out.append(f"Design Doc Validation: {status}")
    lines_out.append(f"File: {report.path}")
    lines_out.append(f"Score: {max(0, report.score)}/100  (passing threshold: 70)")
    lines_out.append(f"{'=' * 60}")

    if report.errors:
        lines_out.append(f"\nERRORS ({len(report.errors)}):")
        for issue in report.errors:
            loc = f" [line {issue.line}]" if issue.line else ""
            lines_out.append(f"  [ERROR] [{issue.category}]{loc} {issue.message}")

    if report.warnings:
        lines_out.append(f"\nWARNINGS ({len(report.warnings)}):")
        for issue in report.warnings:
            loc = f" [line {issue.line}]" if issue.line else ""
            lines_out.append(f"  [WARN]  [{issue.category}]{loc} {issue.message}")

    info_issues = [i for i in report.issues if i.severity == "info"]
    if verbose and info_issues:
        lines_out.append(f"\nINFO ({len(info_issues)}):")
        for issue in info_issues:
            lines_out.append(f"  [INFO]  [{issue.category}] {issue.message}")

    if not [i for i in report.issues if i.severity in ("error", "warning")]:
        lines_out.append("\nNo errors or warnings found.")

    return "\n".join(lines_out)


def render_json(report: ValidationReport) -> str:
    """Render the validation report as JSON."""
    data = {
        "path": report.path,
        "passed": report.passed,
        "score": max(0, report.score),
        "passing_threshold": 70,
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


def validate_design_doc(path: Path, repo_root: Path | None = None) -> ValidationReport:
    """Run all checks on a design doc file and return the aggregated report."""
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
    check_component_descriptions(lines, report)
    check_file_references(lines, report, repo_root)
    check_mermaid_blocks(lines, report)
    check_architecture_diagrams(lines, report)
    check_secrets(lines, report)

    report.score = max(0, report.score)
    return report


def main() -> int:
    """Entry point."""
    parser = argparse.ArgumentParser(
        description="Validate a reverse-engineered design doc for structural completeness.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("doc_path", help="Path to the design doc markdown file")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show additional detail including info-level findings")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Repository root for checking file reference existence (default: skip file checks)",
    )
    args = parser.parse_args()

    path = Path(args.doc_path)
    repo_root = Path(args.repo_root).resolve() if args.repo_root else None
    report = validate_design_doc(path, repo_root=repo_root)

    if args.json:
        print(render_json(report))
    else:
        print(render_text(report, verbose=args.verbose))

    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
