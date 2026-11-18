#!/usr/bin/env bash
# Checks who signed an Android App Bundle (#47). Google Play re-signs the app with its own
# app signing key (Play App Signing); the key on the bundle is the upload key, which must be
# our production key from #40, never the public template debug key. When EXPECTED_CERT_SHA256
# is set, the bundle must carry exactly that key.
# Usage: verify-aab-signature.sh <aab>
set -euo pipefail
aab="$1"

# SHA-256 of the certificate in debug.keystore (alias androiddebugkey, password "android").
DEBUG_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c

# An AAB is signed with jarsigner (v1 signature), so keytool can read its certificate.
certs=$(keytool -printcert -jarfile "$aab" 2>&1)
digest=$(printf '%s\n' "$certs" | sed -n 's/^[[:space:]]*SHA256: //p' | head -1 | tr -d ':' | tr 'A-F' 'a-f')
if [ -z "$digest" ]; then
  echo "::error::$aab is not signed, or keytool could not read its certificate."
  printf '%s\n' "$certs"
  exit 1
fi
echo "Upload certificate SHA-256 of $(basename "$aab"): $digest" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"

if [ "$digest" = "$DEBUG_CERT_SHA256" ]; then
  echo "::error::$aab is signed with the public template debug key; Play would reject it as upload key."
  exit 1
fi
if [ -n "${EXPECTED_CERT_SHA256:-}" ]; then
  expected=$(printf '%s' "$EXPECTED_CERT_SHA256" | tr -d ': ' | tr 'A-F' 'a-f')
  if [ "$digest" != "$expected" ]; then
    echo "::error::$aab is signed with $digest, expected $expected."
    exit 1
  fi
fi
