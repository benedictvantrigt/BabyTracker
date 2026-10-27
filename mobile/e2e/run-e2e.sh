#!/usr/bin/env bash
# Runs on a booted emulator: installs the APK, runs the Maestro flows, records what the
# app scheduled with Android (alarms, notifications), then tests partner sync against a
# local relay with this machine playing the partner's phone. Results are written to $2.
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

# Relay on this machine; the app reaches it as http://localhost:8787 through adb reverse.
RELAY_PORT=8787
(cd "$HERE/../../relay" && WRANGLER_SEND_METRICS=false npx wrangler dev --port "$RELAY_PORT" \
  --ip 127.0.0.1 --persist-to "$OUT/relay-state" > "$OUT/relay.log" 2>&1) &
RELAY_PID=$!
adb reverse tcp:$RELAY_PORT tcp:$RELAY_PORT
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$RELAY_PORT/health" > /dev/null && break; sleep 1; done

adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT_PID=$!

# No interactive prompts in CI; the driver install is slow on an emulator.
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

echo "== maestro $(maestro --version 2>&1 | tail -1) =="
# One Maestro run per flow, in file order: a stuck flow cannot take the others down.
maestro_status=0

# Emulator faults rather than test failures: no report (Maestro hung before the flow
# ran) or the on-device driver died. A flow that hit one is run once more.
infra_failure() { # report file
  [ ! -s "$1" ] || grep -qE 'DeviceServerDied|StatusRuntimeException: UNAVAILABLE' "$1"
}

run_maestro() { # name, flow file, extra maestro args...
  local name="$1" flow="$2"
  shift 2
  (
    cd "$OUT/screenshots" &&
      timeout --kill-after=30s 8m maestro test --format junit --output "$OUT/report-$name.xml" \
        --test-output-dir "$OUT/maestro-output/$name" "$@" "$flow" < /dev/null
  ) 2>&1 | tee -a "$OUT/maestro.txt"
  return "${PIPESTATUS[0]}"
}

run_flow() { # flow file, extra maestro args...
  local flow="$1"
  shift
  local name
  name="$(basename "$flow" .yaml)"
  echo "== $name =="
  run_maestro "$name" "$flow" "$@" && return 0
  if infra_failure "$OUT/report-$name.xml"; then
    echo "== $name: emulator fault, running it once more ==" | tee -a "$OUT/maestro.txt"
    mv "$OUT/report-$name.xml" "$OUT/report-$name-attempt1.xml.txt" 2>/dev/null
    run_maestro "$name" "$flow" "$@" && return 0
  fi
  maestro_status=1
}

# 01-06 run on a fresh install each; 06 leaves reminders scheduled for the checks below.
for flow in "$FLOWS"/0[1-6]_*.yaml; do run_flow "$flow"; done
free -m | tee "$OUT/memory.txt"

# Notification sync is debounced; give it a moment after the last tap.
sleep 3
adb shell date +%s > "$OUT/device-epoch.txt"
adb shell dumpsys alarm > "$OUT/dumpsys-alarm.txt"
adb shell dumpsys notification --noredact > "$OUT/dumpsys-notification.txt"
adb exec-out screencap -p > "$OUT/screenshots/99-final-state.png" || true

# Partner sync: the test machine plays the partner's phone. Invites are single use, so a
# retry after an emulator fault starts a new partner family.
PARTNER="$OUT/partner"
partner_attempt() {
  rm -rf "$PARTNER"
  (cd "$HERE/.." && npx tsx e2e/partner.ts create "$PARTNER" "http://localhost:$RELAY_PORT") \
    2>&1 | tee -a "$OUT/partner.txt"
  [ -f "$PARTNER/invite.txt" ] || return 1
  run_maestro 07_partner_sync "$FLOWS/07_partner_sync.yaml" -e "INVITE=$(cat "$PARTNER/invite.txt")"
}
echo "== 07_partner_sync =="
if ! partner_attempt; then
  if infra_failure "$OUT/report-07_partner_sync.xml"; then
    echo "== 07_partner_sync: emulator fault, running it once more ==" | tee -a "$OUT/maestro.txt"
    mv "$OUT/report-07_partner_sync.xml" "$OUT/report-07_partner_sync-attempt1.xml.txt" 2>/dev/null
    partner_attempt || maestro_status=1
  else
    maestro_status=1
  fi
fi
if [ -f "$PARTNER/invite.txt" ]; then
  (cd "$HERE/.." && npx tsx e2e/partner.ts check "$PARTNER") 2>&1 | tee -a "$OUT/partner.txt"
fi

kill "$LOGCAT_PID" 2>/dev/null || true
kill "$RELAY_PID" 2>/dev/null || true
pkill -f workerd 2>/dev/null || true
rm -rf "$OUT/relay-state"

python3 "$HERE/summarize.py" "$OUT" "$maestro_status"
