#!/usr/bin/env bash
# Checks the Play Store bundle (#47): signed with the expected upload key (the production
# release key from #40, never the public template debug key), and the APK built from the
# same sources targets the API level Google Play requires for new apps.
# Usage: verify-aab.sh <aab> <apk> <min-target-sdk>
set -euo pipefail
aab="$1"
apk="$2"
min_target="$3"

DEBUG_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c

# An AAB is signed like a JAR (v1 signature), so keytool reads its certificate.
digest=$(keytool -printcert -jarfile "$aab" | sed -n 's/^.*SHA256: //p' | head -1 | tr -d ':' | tr 'A-F' 'a-f')
if [ -z "$digest" ]; then
  echo "::error::$aab is not signed."
  exit 1
fi
echo "Upload certificate SHA-256 of $(basename "$aab"): $digest" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
if [ "$digest" = "$DEBUG_CERT_SHA256" ]; then
  echo "::error::$aab is signed with the public template debug key; refusing to publish it."
  exit 1
fi
if [ -n "${EXPECTED_CERT_SHA256:-}" ]; then
  expected=$(printf '%s' "$EXPECTED_CERT_SHA256" | tr -d ': ' | tr 'A-F' 'a-f')
  if [ "$digest" != "$expected" ]; then
    echo "::error::$aab is signed with $digest, expected $expected."
    exit 1
  fi
fi

aapt2=$(ls -d "$ANDROID_HOME"/build-tools/*/aapt2 | sort -V | tail -1)
badging=$("$aapt2" dump badging "$apk")
target=$(printf '%s\n' "$badging" | sed -n "s/^targetSdkVersion:'\([0-9]*\)'.*/\1/p")
version=$(printf '%s\n' "$badging" | sed -n "s/^package: .*versionCode='\([0-9]*\)'.*versionName='\([^']*\)'.*/\2 (versionCode \1)/p")
echo "Target SDK $target, version $version" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
if [ -z "$target" ] || [ "$target" -lt "$min_target" ]; then
  echo "::error::targetSdkVersion is ${target:-unknown}; Google Play requires at least $min_target for new apps and updates."
  exit 1
fi
