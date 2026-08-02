#!/usr/bin/env python3
"""Read skill-dependencies.json and emit shell-consumable output.

The manifest is the single source of truth for the dependency graph. Every shell
script in this skill queries it through this module instead of hardcoding skill
names, sources, or per-mode required sets.

Usage:
  manifest.py version
  manifest.py modes
  manifest.py profiles
  manifest.py required --mode MODE [--framework PROFILE] [--with-arc42]
  manifest.py conditional --framework PROFILE
  manifest.py adr-aliases
  manifest.py install --framework PROFILE|all [--with-arc42] [--with-adrs]
                      [--toolbox-viem] [--toolbox-mocha-ethers]
  manifest.py all-skills
  manifest.py forbidden

Every subcommand prints one record per line. `install` prints
"<source>\t<space separated skills>".
"""

import argparse
import json
import os
import sys

MANIFEST_NAME = "skill-dependencies.json"


def manifest_path():
    override = os.environ.get("SKILL_MANIFEST")
    if override:
        return override
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), MANIFEST_NAME
    )


def load():
    path = manifest_path()
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        fail("manifest not found: %s" % path)
    except json.JSONDecodeError as exc:
        fail("manifest is not valid JSON (%s): %s" % (path, exc))


def fail(message):
    sys.stderr.write("manifest.py: %s\n" % message)
    raise SystemExit(2)


def framework_keys(profile):
    """Map a framework profile onto the manifest's per-framework keys."""
    if profile in ("all", "*"):
        return ["hardhat2", "hardhat3", "foundry"]
    return {
        "hardhat2": ["hardhat2"],
        "hardhat3": ["hardhat3"],
        "foundry": ["foundry"],
        "hybrid-hardhat2-foundry": ["hardhat2", "foundry"],
        "hybrid-hardhat3-foundry": ["hardhat3", "foundry"],
    }.get(profile, [])


def framework_skills(data, profile):
    out = []
    for key in framework_keys(profile):
        for entry in data.get("framework_mandatory", {}).get(key, []):
            out.append(entry)
    return out


def conditional_skills(data, profile):
    out = []
    for key in framework_keys(profile):
        for entry in data.get("framework_conditional", {}).get(key, []):
            out.append(entry)
    return out


def optional_entry(data, name):
    for entry in data.get("optional", []):
        if entry.get("name") == name:
            return entry
    fail("optional skill not declared in manifest: %s" % name)


def cmd_version(data, _args):
    print(data.get("package_version", ""))


def cmd_modes(data, _args):
    for mode in data.get("modes", {}):
        print(mode)


def cmd_profiles(data, _args):
    for profile in data.get("framework_profiles", []):
        print(profile)


def cmd_mode_phases(data, args):
    mode = data.get("modes", {}).get(args.mode)
    if mode is None:
        fail("unknown mode: %s" % args.mode)
    print(mode.get("phases", ""))


def cmd_required(data, args):
    mode = data.get("modes", {}).get(args.mode)
    if mode is None:
        fail("unknown mode: %s" % args.mode)
    names = list(mode.get("base_required", []))
    if mode.get("needs_framework_specialist", True) and args.framework:
        for entry in framework_skills(data, args.framework):
            if entry["name"] not in names:
                names.append(entry["name"])
    if args.with_arc42:
        names.append(optional_entry(data, "arc42-c4")["name"])
    for name in names:
        print(name)


def cmd_conditional(data, args):
    for entry in conditional_skills(data, args.framework):
        print("%s\t%s\t%s" % (entry["name"], entry.get("detector_field", ""), entry.get("package", "")))


def cmd_adr_aliases(data, _args):
    entry = optional_entry(data, "documentation-and-adrs")
    print(entry["name"])
    for alias in entry.get("aliases", []):
        print(alias)


def cmd_install(data, args):
    """Group skills by source so each repository is fetched once."""
    grouped = []

    def add(source, name):
        for pair in grouped:
            if pair[0] == source:
                if name not in pair[1]:
                    pair[1].append(name)
                return
        grouped.append((source, [name]))

    for entry in data.get("base_mandatory", []):
        add(entry["source"], entry["name"])
    for entry in framework_skills(data, args.framework):
        add(entry["source"], entry["name"])
    wanted_conditional = {
        "TOOLBOX_VIEM_VERSION": args.toolbox_viem,
        "TOOLBOX_MOCHA_ETHERS_VERSION": args.toolbox_mocha_ethers,
    }
    for entry in conditional_skills(data, args.framework):
        if args.framework in ("all", "*") or wanted_conditional.get(entry.get("detector_field")):
            add(entry["source"], entry["name"])
    if args.with_arc42:
        entry = optional_entry(data, "arc42-c4")
        add(entry["source"], entry["name"])
    if args.with_adrs:
        entry = optional_entry(data, "documentation-and-adrs")
        add(entry["source"], entry["name"])
    for source, names in grouped:
        print("%s\t%s" % (source, " ".join(names)))


def cmd_all_skills(data, _args):
    """Every skill name the orchestrator can request, with its source."""
    seen = set()

    def emit(name, source, kind):
        if name in seen:
            return
        seen.add(name)
        print("%s\t%s\t%s" % (name, source, kind))

    for entry in data.get("base_mandatory", []):
        emit(entry["name"], entry["source"], "base")
    for key, entries in sorted(data.get("framework_mandatory", {}).items()):
        for entry in entries:
            emit(entry["name"], entry["source"], "framework:%s" % key)
    for key, entries in sorted(data.get("framework_conditional", {}).items()):
        for entry in entries:
            emit(entry["name"], entry["source"], "conditional:%s" % key)
    for entry in data.get("optional", []):
        emit(entry["name"], entry["source"], "optional")


def cmd_forbidden(data, _args):
    for entry in data.get("forbidden", []):
        print("%s\t%s\t%s" % (entry["name"], entry.get("source", ""), entry.get("reason", "")))


def main(argv):
    parser = argparse.ArgumentParser(prog="manifest.py", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("version").set_defaults(func=cmd_version)
    sub.add_parser("modes").set_defaults(func=cmd_modes)
    sub.add_parser("profiles").set_defaults(func=cmd_profiles)
    sub.add_parser("adr-aliases").set_defaults(func=cmd_adr_aliases)
    sub.add_parser("all-skills").set_defaults(func=cmd_all_skills)
    sub.add_parser("forbidden").set_defaults(func=cmd_forbidden)

    phases = sub.add_parser("mode-phases")
    phases.add_argument("--mode", required=True)
    phases.set_defaults(func=cmd_mode_phases)

    required = sub.add_parser("required")
    required.add_argument("--mode", required=True)
    required.add_argument("--framework", default="")
    required.add_argument("--with-arc42", action="store_true")
    required.set_defaults(func=cmd_required)

    conditional = sub.add_parser("conditional")
    conditional.add_argument("--framework", required=True)
    conditional.set_defaults(func=cmd_conditional)

    install = sub.add_parser("install")
    install.add_argument("--framework", required=True)
    install.add_argument("--with-arc42", action="store_true")
    install.add_argument("--with-adrs", action="store_true")
    install.add_argument("--toolbox-viem", action="store_true")
    install.add_argument("--toolbox-mocha-ethers", action="store_true")
    install.set_defaults(func=cmd_install)

    args = parser.parse_args(argv)
    args.func(load(), args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
