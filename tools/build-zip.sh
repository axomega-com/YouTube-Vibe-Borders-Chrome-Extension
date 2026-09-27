#!/usr/bin/env bash
# Builds the Chrome Web Store zip from git-TRACKED files only, then refuses to hand back a
# package that would be rejected or that could leak the dev key. `src/config.local.js` is
# gitignored on purpose, so building from HEAD rather than the working tree is the whole
# safety mechanism here.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./src/manifest.json').version")
name=$(node -p "require('./src/manifest.json').name")
out="out/youtube-vibe-borders-${version}.zip"

# Refuse to build if the tree is dirty in src/: the zip comes from HEAD, so uncommitted
# changes would silently be left out of the package you just tested.
if [ -n "$(git status --porcelain -- src)" ]; then
  echo "REFUSING: src/ has uncommitted changes; commit them first or the zip will not match HEAD" >&2
  git status --short -- src >&2
  exit 1
fi

mkdir -p out
rm -f "$out"
git archive --format=zip -o "$out" HEAD:src

fail() { echo "REFUSING: $1" >&2; exit 1; }

# manifest.json must sit at the ZIP ROOT - the store rejects a nested folder.
unzip -l "$out" | grep -qE ' manifest\.json$' || fail "manifest.json is not at the zip root"
# A dev key in the package would leak a credential to every user.
unzip -p "$out" | grep -q 'DEV_API_KEY' && fail "a dev API key is inside the package"
# The store requires a 128px icon present in the package.
unzip -l "$out" | grep -q 'icons/icon128.png' || fail "icons/icon128.png is missing"
unzip -l "$out" | grep -q 'icons/icon16.png' || fail "icons/icon16.png is missing"
# Remote code is banned by MV3 policy; make sure nothing references an http(s) script.
unzip -p "$out" manifest.json | grep -qE '"key"\s*:' && fail "manifest contains a \"key\" field"

echo "built: $out"
echo "  name:    $name"
echo "  version: $version"
echo "  files:   $(unzip -l "$out" | tail -1 | awk '{print $2}')"
node -p "'  size:    ' + (require('fs').statSync('$out').size / 1024).toFixed(1) + ' KB'"
