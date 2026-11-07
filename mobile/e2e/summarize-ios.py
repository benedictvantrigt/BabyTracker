"""Turns raw iOS Simulator E2E output into summary.md and an exit code.

Checks the Maestro flows and, after flow 07, that the partner phone (played by
e2e/partner.ts) received the app's diaper. Android-only checks (alarms, ongoing
notifications) are left out.
"""

import json
import sys
from pathlib import Path

from summarize import flow_results


def main() -> int:
    out = Path(sys.argv[1])
    maestro_status = int(sys.argv[2])
    flows = flow_results(out)
    partner_file = out / "partner" / "check.json"
    partner = json.loads(partner_file.read_text()) if partner_file.exists() else {}

    checks = [
        ("Maestro flows", maestro_status == 0 and bool(flows) and all(ok for _, ok, _ in flows)),
        ("Partner phone received the app's diaper", partner.get("diaperFromApp") is True),
        ("Two phones in the family", partner.get("devices") == 2),
    ]

    lines = ["# iOS Simulator E2E results", ""]
    lines += ["## Checks", "", "| Check | Result |", "|---|---|"]
    lines += [f"| {name} | {'PASS' if ok else 'FAIL'} |" for name, ok in checks]
    lines += ["", "## Flows", "", "| Flow | Result | Failure |", "|---|---|---|"]
    lines += [f"| {name} | {'PASS' if ok else 'FAIL'} | {msg} |" for name, ok, msg in flows]
    if not flows:
        lines.append("| (no reports) | FAIL | see maestro.txt |")
    shots = sorted(p.name for p in (out / "screenshots").glob("*.png"))
    lines += ["", "## Screenshots", ""] + [f"- screenshots/{s}" for s in shots]

    summary = "\n".join(lines) + "\n"
    (out / "summary.md").write_text(summary)
    print(summary)
    return 0 if all(ok for _, ok in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
