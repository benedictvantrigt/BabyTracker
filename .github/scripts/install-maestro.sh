#!/usr/bin/env bash
# Installs a fixed Maestro version into ~/.maestro from its GitHub release, checks the zip
# against the release checksum and adds it to the PATH of later steps. The workflows cache
# ~/.maestro under the version, so a run only downloads when the cache is empty. The
# get.maestro.mobile.dev installer used before always took the latest version and exited 0
# when its own download failed (HTTP 504 on 8 November 2026), failing every flow later on.
# Usage: install-maestro.sh <version> <sha256 of maestro.zip>
set -euo pipefail
version="$1"
sha256="$2"
dir="$HOME/.maestro"

if ! "$dir/bin/maestro" --version 2>/dev/null | grep -qF "$version"; then
  zip=$(mktemp)
  url="https://github.com/mobile-dev-inc/maestro/releases/download/cli-$version/maestro.zip"
  curl -fsSL --retry 5 --retry-all-errors --retry-delay 10 -o "$zip" "$url"
  echo "$sha256  $zip" | shasum -a 256 -c -
  rm -rf "$dir"
  mkdir -p "$dir"
  unzip -q "$zip" -d "$dir"
  rm -f "$zip"
  # The zip holds a top-level maestro/ folder with bin/ and lib/.
  mv "$dir"/maestro/* "$dir"/
  rmdir "$dir/maestro"
fi

"$dir/bin/maestro" --version
echo "$dir/bin" >> "${GITHUB_PATH:-/dev/null}"
