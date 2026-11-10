#!/usr/bin/env bash
# Runs on macOS with a booted iPhone Simulator: installs the app, runs the Maestro flows
# (one run per flow), then partner sync against a local relay with this machine playing
# the partner's phone. The Simulator shares the Mac's network, so the app reaches the relay
# at http://localhost:8787 directly. Results (reports, screenshots, summary.md) go to $3.
set -uo pipefail

APP="$1"   # path to the .app built for the Simulator
UDID="$2"  # the booted Simulator
OUT="$3"
BUNDLE=com.babytracker.app.acc  # CI tests the acceptance build
HERE="$(cd "$(dirname "$0")" && pwd)"
FLOWS="$(cd "$HERE/../.maestro" && pwd)"

mkdir -p "$OUT/screenshots"
xcrun simctl install "$UDID" "$APP"

RELAY_PORT=8787
(cd "$HERE/../../relay" && WRANGLER_SEND_METRICS=false npx wrangler dev --port "$RELAY_PORT" \
  --ip 127.0.0.1 --persist-to "$OUT/relay-state" > "$OUT/relay.log" 2>&1) &
RELAY_PID=$!
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$RELAY_PORT/health" > /dev/null && break; sleep 1; done

xcrun simctl spawn "$UDID" log stream --style compact \
  --predicate 'process CONTAINS[c] "baby" OR eventMessage CONTAINS "ReactNativeJS"' > "$OUT/device-log.txt" 2>&1 &
LOG_PID=$!

export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
export MAESTRO_DRIVER_STARTUP_TIMEOUT=240000

echo "== maestro $(maestro --version 2>&1 | tail -1) =="
maestro_status=0

# Simulator faults rather than test failures: no report (Maestro hung before the flow ran)
# or Maestro lost its driver on the Simulator. A flow that hit one is run once more, as on
# Android (run-e2e.sh).
infra_failure() { # report file
  [ ! -s "$1" ] || grep -qE 'DeviceUnreachableException|XCTestDriverUnreachable' "$1"
}

run_maestro() { # name, flow file, extra maestro args...
  local name="$1" flow="$2"
  shift 2
  (
    cd "$OUT/screenshots" &&
      perl -e 'alarm shift; exec @ARGV' 600 maestro --device "$UDID" test --format junit \
        --output "$OUT/report-$name.xml" --test-output-dir "$OUT/maestro-output/$name" \
        "$@" "$flow" < /dev/null
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
    echo "== $name: Simulator fault, running it once more ==" | tee -a "$OUT/maestro.txt"
    mv "$OUT/report-$name.xml" "$OUT/report-$name-attempt1.xml.txt" 2>/dev/null
    run_maestro "$name" "$flow" "$@" && return 0
  fi
  maestro_status=1
}

# 06 last: it leaves a feed running for the notification checks after the flows.
for flow in "$FLOWS"/0[1-5]_*.yaml "$FLOWS"/08_*.yaml "$FLOWS"/06_*.yaml; do run_flow "$flow"; done
xcrun simctl io "$UDID" screenshot "$OUT/screenshots/99-final-state.png" || true

PARTNER="$OUT/partner"
(cd "$HERE/.." && npx tsx e2e/partner.ts create "$PARTNER" "http://localhost:$RELAY_PORT") \
  2>&1 | tee -a "$OUT/partner.txt"
if [ -f "$PARTNER/invite.txt" ]; then
  run_flow "$FLOWS/07_partner_sync.yaml" -e "INVITE=$(cat "$PARTNER/invite.txt")"
  (cd "$HERE/.." && npx tsx e2e/partner.ts check "$PARTNER") 2>&1 | tee -a "$OUT/partner.txt"
else
  maestro_status=1
fi

kill "$LOG_PID" "$RELAY_PID" 2>/dev/null || true
pkill -f workerd 2>/dev/null || true
rm -rf "$OUT/relay-state"

python3 "$HERE/summarize-ios.py" "$OUT" "$maestro_status"
