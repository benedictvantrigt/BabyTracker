#!/usr/bin/env bash
# Checks the target SDK of a built APK (#47). Google Play only accepts new apps and updates
# that target a recent Android version (API 36 since 31 August 2026); this catches an Expo or
# React Native update that lowers it, before an upload is refused.
# Usage: verify-target-sdk.sh <apk> <minimum API level>
set -euo pipefail
apk="$1"
minimum="$2"

aapt2=$(ls -d "$ANDROID_HOME"/build-tools/*/aapt2 | sort -V | tail -1)
target=$("$aapt2" dump badging "$apk" | sed -n "s/^targetSdkVersion:'\([0-9]*\)'.*/\1/p" | head -1)
if [ -z "$target" ]; then
  echo "::error::Could not read targetSdkVersion from $apk"
  exit 1
fi
echo "targetSdkVersion of $(basename "$apk"): $target (Play requires at least $minimum)" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
if [ "$target" -lt "$minimum" ]; then
  echo "::error::$apk targets API $target; Google Play requires at least API $minimum."
  exit 1
fi
