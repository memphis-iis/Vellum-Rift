#!/usr/bin/env bash
# Firefox only decodes Brotli over HTTPS. For plain-HTTP LAN parties, decompress
# Unity Build/*.br → uncompressed files and patch index.html URLs (drop .br).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBGL="${WEBGL_DIST:-${ROOT}/webgl}"
BUILD="${WEBGL}/Build"
INDEX="${WEBGL}/index.html"

[[ -d "$BUILD" ]] || {
  echo "prepare-webgl-http: no ${BUILD} (skip)" >&2
  exit 0
}

_decompress_br() {
  local src=$1 dest=$2
  if command -v brotli >/dev/null 2>&1; then
    brotli -d -f -o "$dest" "$src"
    return
  fi
  # Laptop/kit may lack host brotli — use alpine once.
  docker run --rm \
    -v "$(dirname "$src"):/work:rw" \
    alpine:3.20 \
    sh -c "apk add --no-cache brotli >/dev/null && brotli -d -f -o /work/$(basename "$dest") /work/$(basename "$src")"
}

shopt -s nullglob
for src in "$BUILD"/*.br; do
  dest="${src%.br}"
  if [[ -f "$dest" && ! "$src" -nt "$dest" ]]; then
    continue
  fi
  echo "prepare-webgl-http: decompress $(basename "$src") → $(basename "$dest")"
  _decompress_br "$src" "$dest"
  chmod a+r "$dest" || true
done

chmod a+r "$BUILD"/* 2>/dev/null || true

if [[ -f "$INDEX" ]]; then
  # Idempotent: strip trailing .br from Unity config URLs only.
  sed -i \
    -e 's/\.data\.br"/.data"/g' \
    -e 's/\.framework\.js\.br"/.framework.js"/g' \
    -e 's/\.wasm\.br"/.wasm"/g' \
    -e "s/\.data\.br'/.data'/g" \
    -e "s/\.framework\.js\.br'/.framework.js'/g" \
    -e "s/\.wasm\.br'/.wasm'/g" \
    "$INDEX"
  echo "prepare-webgl-http: patched ${INDEX} for uncompressed HTTP"
fi
