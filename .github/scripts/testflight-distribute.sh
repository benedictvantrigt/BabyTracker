#!/usr/bin/env bash
# Hands an uploaded build to an external TestFlight group: waits until App Store Connect has
# processed it, sets the "What to Test" text, adds it to the group and submits it for Beta App
# Review (Apple skips the review for most later builds of an approved version).
# Usage: testflight-distribute.sh <app id> <build number> <group name> <what to test>
# Needs ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID: an App Store Connect API key with the App
# Manager role (the Developer role may not add builds to external groups). README, App Store.
set -euo pipefail

app="$1"
build_number="$2"
group_name="$3"
what_to_test="$4"
: "${ASC_KEY_PATH:?}" "${ASC_KEY_ID:?}" "${ASC_ISSUER_ID:?}"

here=$(cd "$(dirname "$0")" && pwd)
api="https://api.appstoreconnect.apple.com/v1"

call() {
  local method="$1" path="$2" body="${3:-}" out code token
  token=$(bash "$here/asc-jwt.sh" "$ASC_KEY_PATH" "$ASC_KEY_ID" "$ASC_ISSUER_ID")
  out=$(mktemp)
  code=$(curl -gsS -o "$out" -w '%{http_code}' -X "$method" "$api$path" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' ${body:+-d "$body"})
  if [ "${code:0:1}" != 2 ]; then
    echo "::error::App Store Connect $method $path failed ($code): $(cat "$out")" >&2
    rm -f "$out"
    return 1
  fi
  cat "$out"
  rm -f "$out"
}

# 1. The build appears a few minutes after upload and then processes (usually 5-30 minutes).
build_id=""
for i in $(seq 1 90); do
  json=$(call GET "/builds?filter[app]=$app&filter[version]=$build_number&fields[builds]=processingState&limit=1")
  build_id=$(printf '%s' "$json" | jq -r '.data[0].id // empty')
  state=$(printf '%s' "$json" | jq -r '.data[0].attributes.processingState // "NOT_FOUND"')
  echo "Build $build_number: $state"
  case "$state" in
    VALID) break ;;
    FAILED|INVALID) echo "::error::App Store Connect could not process build $build_number ($state)"; exit 1 ;;
  esac
  [ "$i" = 90 ] && { echo "::error::Build $build_number was not processed within 60 minutes"; exit 1; }
  sleep 40
done

# 2. "What to Test" for this build (English (U.S.), the app's primary language).
loc=$(call GET "/builds/$build_id/betaBuildLocalizations" | jq -r '.data[] | select(.attributes.locale=="en-US") | .id' | head -n 1)
text=$(jq -Rn --arg t "$what_to_test" '$t')
if [ -n "$loc" ]; then
  call PATCH "/betaBuildLocalizations/$loc" \
    "{\"data\":{\"type\":\"betaBuildLocalizations\",\"id\":\"$loc\",\"attributes\":{\"whatsNew\":$text}}}" > /dev/null
else
  call POST "/betaBuildLocalizations" \
    "{\"data\":{\"type\":\"betaBuildLocalizations\",\"attributes\":{\"locale\":\"en-US\",\"whatsNew\":$text},\"relationships\":{\"build\":{\"data\":{\"type\":\"builds\",\"id\":\"$build_id\"}}}}}" > /dev/null
fi

# 3. Add the build to the external group.
group_id=$(call GET "/apps/$app/betaGroups?fields[betaGroups]=name,isInternalGroup&limit=200" |
  jq -r --arg n "$group_name" '.data[] | select(.attributes.name==$n and .attributes.isInternalGroup==false) | .id' | head -n 1)
if [ -z "$group_id" ]; then
  echo "::error::No external TestFlight group named \"$group_name\""
  exit 1
fi
call POST "/betaGroups/$group_id/relationships/builds" "{\"data\":[{\"type\":\"builds\",\"id\":\"$build_id\"}]}" > /dev/null
echo "Added build $build_number to \"$group_name\""

# 4. Submit for Beta App Review unless it already is (or was) submitted.
existing=$(call GET "/betaAppReviewSubmissions?filter[build]=$build_id" | jq -r '.data[0].attributes.betaReviewState // empty')
if [ -n "$existing" ]; then
  echo "Beta App Review: $existing"
else
  call POST "/betaAppReviewSubmissions" \
    "{\"data\":{\"type\":\"betaAppReviewSubmissions\",\"relationships\":{\"build\":{\"data\":{\"type\":\"builds\",\"id\":\"$build_id\"}}}}}" |
    jq -r '"Beta App Review: " + .data.attributes.betaReviewState'
fi
