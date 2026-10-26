#!/usr/bin/env bash
# Runs on a booted emulator: installs the APK, runs the Maestro flows, then records what
# the app scheduled with Android (alarms, notifications). Results are written to $2.
set -uo pipefail

APK="$1"
OUT="$2"
PKG=com.babytracker.app
HERE="$(cd "$(dirname "$0")" && pwd)"
FLOWS="$(cd "$HERE/../.maestro" && pwd)"

mkdir -p "$OUT/screenshots"
timeout 5m adb install -r "$APK"
# Exact alarms are denied by default on Android 14+; a user grants them in Settings.
adb shell appops set "$PKG" SCHEDULE_EXACT_ALARM allow

adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT_PID=$!

# No interactive prompts in CI; the driver install is slow on an emulator.
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

echo "== maestro $(maestro --version 2>&1 | tail -1) =="
# One Maestro run per flow, in file order: a stuck flow cannot take the others down, and
# 06 (which leaves reminders scheduled for the checks below) always runs last.
maestro_status=0
for flow in "$FLOWS"/0*.yaml; do
  name="$(basename "$flow" .yaml)"
  echo "== $name =="
  (
    cd "$OUT/screenshots" &&
      timeout --kill-after=30s 8m maestro test --format junit --output "$OUT/report-$name.xml" \
        --test-output-dir "$OUT/maestro-output/$name" "$flow" < /dev/null
  ) 2>&1 | tee -a "$OUT/maestro.txt"
  [ "${PIPESTATUS[0]}" -eq 0 ] || maestro_status=1
done
free -m | tee "$OUT/memory.txt"

# Notification sync is debounced; give it a moment after the last tap.
sleep 3
adb shell date +%s > "$OUT/device-epoch.txt"
adb shell dumpsys alarm > "$OUT/dumpsys-alarm.txt"
adb shell dumpsys notification --noredact > "$OUT/dumpsys-notification.txt"
adb exec-out screencap -p > "$OUT/screenshots/99-final-state.png" || true
kill "$LOGCAT_PID" 2>/dev/null || true

python3 "$HERE/summarize.py" "$OUT" "$maestro_status"
