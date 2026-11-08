#!/usr/bin/env bash
# Checks who signed an APK (#40). Fails when it carries the public debug key that ships with
# every Expo/React Native template, or, when EXPECTED_CERT_SHA256 is set, any other key than
# that one. Usage: verify-apk-signature.sh <apk> <require-release-key|allow-debug-key>
set -euo pipefail
apk="$1"
mode="$2"

# SHA-256 of the certificate in debug.keystore (alias androiddebugkey, password "android").
DEBUG_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c

apksigner=$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -1)
"$apksigner" verify --verbose "$apk" > /dev/null
digest=$("$apksigner" verify --print-certs "$apk" |
  sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | tr 'A-F' 'a-f')
if [ -z "$digest" ]; then
  echo "::error::Could not read the signing certificate of $apk"
  exit 1
fi
echo "Signing certificate SHA-256 of $(basename "$apk"): $digest" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

if [ "$digest" = "$DEBUG_CERT_SHA256" ]; then
  if [ "$mode" = require-release-key ]; then
    echo "::error::$apk is signed with the public template debug key; refusing to publish it."
    exit 1
  fi
  echo "::warning::$apk is signed with the public template debug key (no release keystore configured)."
  exit 0
fi
if [ -n "${EXPECTED_CERT_SHA256:-}" ]; then
  expected=$(printf '%s' "$EXPECTED_CERT_SHA256" | tr -d ': ' | tr 'A-F' 'a-f')
  if [ "$digest" != "$expected" ]; then
    echo "::error::$apk is signed with $digest, expected $expected."
    exit 1
  fi
fi
