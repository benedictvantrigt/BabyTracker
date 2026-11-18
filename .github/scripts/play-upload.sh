#!/usr/bin/env bash
# Uploads an Android App Bundle to a Google Play track with the Play Developer API (edits).
# Usage: play-upload.sh <bundle.aab> <package> <track> <release name> [status]
# Needs PLAY_ACCESS_TOKEN: an OAuth token with the androidpublisher scope. CI gets one for the
# play-publisher service account through Workload Identity Federation (README, Google Play).
# Status: "completed" rolls the release out to the track; "draft" only creates it, which Play
# requires while the app has never been published.
set -euo pipefail

aab="$1"
package="$2"
track="$3"
name="$4"
status="${5:-completed}"
: "${PLAY_ACCESS_TOKEN:?PLAY_ACCESS_TOKEN is not set}"

api="https://androidpublisher.googleapis.com/androidpublisher/v3/applications/$package"
upload="https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/$package"
auth=(-H "Authorization: Bearer $PLAY_ACCESS_TOKEN")

call() {
  local out
  if ! out=$(curl -sS --fail-with-body "${auth[@]}" "$@"); then
    echo "::error::Play API call failed: $out" >&2
    return 1
  fi
  printf '%s' "$out"
}

edit=$(call -X POST "$api/edits" | jq -r .id)
echo "Edit $edit"

version_code=$(call -X POST -H "Content-Type: application/octet-stream" \
  --data-binary "@$aab" "$upload/edits/$edit/bundles?uploadType=media" | jq -r .versionCode)
echo "Uploaded bundle, versionCode $version_code"

body=$(jq -n --arg track "$track" --arg name "$name" --arg vc "$version_code" --arg status "$status" \
  '{track: $track, releases: [{name: $name, versionCodes: [$vc], status: $status}]}')
call -X PUT -H "Content-Type: application/json" -d "$body" "$api/edits/$edit/tracks/$track" > /dev/null

call -X POST "$api/edits/$edit:commit" > /dev/null
echo "Released $name (versionCode $version_code) to the $track track with status $status"
