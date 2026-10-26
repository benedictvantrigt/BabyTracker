"""Turns raw E2E output into summary.md and an exit code.

Checks, besides the Maestro flows:
- the app has at least one alarm pending with Android (nap and/or feed reminder);
- the running feed timer shows an ongoing notification.
"""

import datetime as dt
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = "com.babytracker.app"


def flow_results(out: Path):
    rows = []
    for report in sorted(out.glob("report-*.xml")):
        rows += cases(report)
    return rows


def cases(report: Path):
    rows = []
    try:
        root = ET.parse(report).getroot()
    except ET.ParseError:
        return [(report.stem.removeprefix("report-"), False, "unreadable report")]
    for case in root.iter("testcase"):
        failure = case.find("failure")
        if failure is None:
            failure = case.find("error")
        message = ""
        if failure is not None:
            message = (failure.get("message") or failure.text or "").strip().splitlines()[0][:200]
        rows.append((case.get("name") or case.get("id") or "?", failure is None, message))
    return rows


def pending_alarms(dumpsys: str):
    """Trigger times (epoch ms) of alarms owned by the app."""
    times = []
    for line in dumpsys.splitlines():
        if PKG in line and "Alarm{" in line:
            m = re.search(r"origWhen (\d+)", line)
            if m:
                times.append(int(m.group(1)))
    return sorted(set(times))


def main() -> int:
    out = Path(sys.argv[1])
    maestro_status = int(sys.argv[2])
    flows = flow_results(out)
    alarm_text = (out / "dumpsys-alarm.txt").read_text(errors="replace")
    notif_text = (out / "dumpsys-notification.txt").read_text(errors="replace")
    device_now = int((out / "device-epoch.txt").read_text().strip() or 0)

    alarms = pending_alarms(alarm_text)
    timer_notification = "Feeding · Left" in notif_text and f"pkg={PKG}" in notif_text

    checks = [
        ("Maestro flows", maestro_status == 0 and bool(flows) and all(ok for _, ok, _ in flows)),
        ("Reminder alarm pending with Android", bool(alarms)),
        ("Ongoing notification for running feed timer", timer_notification),
    ]

    lines = ["# Android E2E results", ""]
    lines.append(f"Device time (UTC): {dt.datetime.fromtimestamp(device_now, dt.timezone.utc):%Y-%m-%d %H:%M}")
    lines += ["", "## Checks", "", "| Check | Result |", "|---|---|"]
    lines += [f"| {name} | {'PASS' if ok else 'FAIL'} |" for name, ok in checks]
    lines += ["", "## Flows", "", "| Flow | Result | Failure |", "|---|---|---|"]
    lines += [f"| {name} | {'PASS' if ok else 'FAIL'} | {msg} |" for name, ok, msg in flows]
    if not flows:
        lines.append("| (no reports) | FAIL | see maestro.txt |")
    lines += ["", "## Pending alarms", ""]
    for t in alarms:
        when = dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc)
        delta = (t / 1000 - device_now) / 60
        lines.append(f"- {when:%H:%M} UTC (in {delta:.0f} min)")
    if not alarms:
        lines.append("- none")
    shots = sorted(p.name for p in (out / "screenshots").glob("*.png"))
    lines += ["", "## Screenshots", ""] + [f"- screenshots/{s}" for s in shots]

    summary = "\n".join(lines) + "\n"
    (out / "summary.md").write_text(summary)
    print(summary)
    return 0 if all(ok for _, ok in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
