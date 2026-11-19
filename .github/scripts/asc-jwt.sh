#!/usr/bin/env bash
# Prints a short-lived App Store Connect API token (ES256 JWT, 15 minutes).
# Usage: asc-jwt.sh <key.p8> <key id> <issuer id>
# Needs only openssl, so it runs on the macOS runner and in Git Bash.
set -euo pipefail

key="$1"
kid="$2"
iss="$3"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

now=$(date +%s)
header=$(printf '{"alg":"ES256","kid":"%s","typ":"JWT"}' "$kid" | b64url)
payload=$(printf '{"iss":"%s","iat":%d,"exp":%d,"aud":"appstoreconnect-v1"}' "$iss" "$now" $((now + 900)) | b64url)
input="$header.$payload"

# openssl writes an ASN.1 DER signature; a JWT wants r and s as two 32-byte numbers.
der=$(printf '%s' "$input" | openssl dgst -sha256 -sign "$key" | openssl asn1parse -inform DER |
  awk -F: '/INTEGER/ {print $NF}')
r=$(printf '%s' "$der" | sed -n 1p)
s=$(printf '%s' "$der" | sed -n 2p)
pad() { printf '%064s' "$1" | tr ' ' 0 | tail -c 64; }
sig=$(printf '%s%s' "$(pad "$r")" "$(pad "$s")" | xxd -r -p | b64url)

printf '%s.%s\n' "$input" "$sig"
