#!/usr/bin/env bash
# Prep-day (internet OK): build/pull images, save tars, copy WebGL/APK stubs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "${ROOT}/../../.." && pwd)"
cd "${ROOT}"

mkdir -p images quest seed

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

# Placeholder runtime so compose config validates during build
cat > runtime.env <<EOF
SERVER_LAN_IP=127.0.0.1
S3_ENDPOINT=http://127.0.0.1:9000
DASHBOARD_PUBLIC_URL=http://127.0.0.1/
WEBGL_PUBLIC_URL=http://127.0.0.1/webgl/
API_PUBLIC_URL=http://127.0.0.1:4000
PORT=4000
DISCOVER_PORT=41234
EOF

echo "[build-kit] building / pulling images…"
docker compose --env-file .env --env-file runtime.env pull || true
docker compose --env-file .env --env-file runtime.env build

IMAGES=(
  "postgres:16-alpine"
  "pgsty/silo:RELEASE.2026-09-16T00-00-00Z"
  "pgsty/mc:RELEASE.2026-09-16T00-00-00Z"
  "nginx:1.27-alpine"
  "museum-kit-web-dashboard:local"
  "museum-kit-lan-discover:local"
)

BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/memphis-iis/vellum-rift/backend:latest}"
IMAGES+=("${BACKEND_IMAGE}")

echo "[build-kit] docker save → images/"
rm -f images/*.tar
i=0
for img in "${IMAGES[@]}"; do
  i=$((i + 1))
  safe="$(echo "${img}" | tr '/:' '__')"
  docker save -o "images/$(printf '%02d' "$i")-${safe}.tar" "${img}"
done

WEBGL_SRC="${WEBGL_SRC:-${REPO}/vr-client-unity/Vellum Rift/web build}"
WEBGL_DST="${REPO}/infra/deploy/lan-party/webgl"
if [[ -d "${WEBGL_SRC}" ]]; then
  echo "[build-kit] rsync WebGL → lan-party/webgl"
  mkdir -p "${WEBGL_DST}"
  rsync -a --delete "${WEBGL_SRC}/" "${WEBGL_DST}/"
else
  echo "[build-kit] WARN: WebGL build missing at ${WEBGL_SRC}"
fi

APK_SRC="${APK_SRC:-${REPO}/vr-client-unity/build/VellumRift-Quest.apk}"
if [[ -f "${APK_SRC}" ]]; then
  cp -f "${APK_SRC}" quest/VellumRift-Quest.apk
  echo "[build-kit] copied Quest APK → quest/"
else
  echo "[build-kit] WARN: Quest APK missing — build with discovery + VELLUM_BUILD_ALLOW_INSECURE_HTTP=1"
fi

sha256sum images/*.tar > images/SHA256SUMS 2>/dev/null || true

echo "[build-kit] packing lightweight client USB payload…"
"${ROOT}/client-usb/pack-client-usb.sh" || echo "[build-kit] WARN: client-usb pack failed"

echo "[build-kit] done. Copy this directory to the Ventoy persistence volume (/opt/vellum-museum-kit)."
echo "[build-kit] Client sticks: client-usb/dist/vellum-client/ → see client-usb/README.md"
