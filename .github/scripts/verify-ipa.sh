#!/usr/bin/env bash
# Checks an App Store .ipa before upload: every bundle in it is signed with an Apple
# Distribution certificate, carries production push and no debugging entitlement, and the app
# is com.napchime.app. Usage: verify-ipa.sh <app.ipa>
set -euo pipefail

ipa="$1"
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
unzip -q "$ipa" -d "$dir"
app=$(ls -d "$dir"/Payload/*.app | head -n 1)

bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Info.plist")
build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Info.plist")
echo "App: $bundle_id $version ($build)"
if [ "$bundle_id" != "com.napchime.app" ]; then
  echo "::error::The app's bundle ID is $bundle_id, expected com.napchime.app"
  exit 1
fi

status=0
while IFS= read -r bundle; do
  name=${bundle#"$dir/Payload/"}
  authority=$(codesign -dvv "$bundle" 2>&1 | sed -n 's/^Authority=//p' | head -n 1)
  ents=$(codesign -d --entitlements - --xml "$bundle" 2>/dev/null | plutil -convert json -o - - 2>/dev/null || echo '{}')
  echo "$name: $authority"
  echo "  entitlements: $ents"
  case "$authority" in
    "Apple Distribution:"*|"iPhone Distribution:"*) ;;
    *) echo "::error::$name is not signed with a distribution certificate ($authority)"; status=1 ;;
  esac
  if echo "$ents" | grep -q '"get-task-allow":true'; then
    echo "::error::$name allows debugging (get-task-allow)"; status=1
  fi
  if echo "$ents" | grep -q '"aps-environment"' && ! echo "$ents" | grep -q '"aps-environment":"production"'; then
    echo "::error::$name has development push (aps-environment)"; status=1
  fi
done < <(echo "$app"; find "$app" -mindepth 1 -type d \( -name '*.app' -o -name '*.appex' \) -prune -print)
exit $status
