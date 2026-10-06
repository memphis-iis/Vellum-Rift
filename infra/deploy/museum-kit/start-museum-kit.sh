#!/usr/bin/env bash
# Detect LAN IPv4 → runtime.env → docker compose up → wait for edge health.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[museum-kit] copied .env.example → .env"
fi

detect_ip() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' || true)"
  fi
  if [[ -z "${ip}" ]]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  # Reject empty / loopback
  if [[ -z "${ip}" || "${ip}" == 127.* ]]; then
    return 1
  fi
  printf '%s' "${ip}"
}

echo "[museum-kit] waiting for LAN IPv4…"
IP=""
for _ in $(seq 1 60); do
  if IP="$(detect_ip)"; then
    break
  fi
  IP=""
  sleep 2
done

if [[ -z "${IP}" ]]; then
  echo "[museum-kit] ERROR: no LAN IP. Connect Ethernet/Wi‑Fi to the kit router and retry."
  exit 1
fi

echo "[museum-kit] SERVER_LAN_IP=${IP}"

cat > runtime.env <<EOF
SERVER_LAN_IP=${IP}
S3_ENDPOINT=http://${IP}:9000
DASHBOARD_PUBLIC_URL=http://${IP}/
WEBGL_PUBLIC_URL=http://${IP}/webgl/
API_PUBLIC_URL=http://${IP}:4000
PORT=4000
DISCOVER_PORT=41234
EOF

if [[ -d images ]] && compgen -G "images/*.tar" >/dev/null; then
  echo "[museum-kit] loading docker image tars…"
  for tar in images/*.tar; do
    docker load -i "${tar}"
  done
fi

docker compose --env-file .env --env-file runtime.env up -d --build

echo "[museum-kit] waiting for http://${IP}/api/health …"
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1/api/health" >/dev/null 2>&1 \
    || curl -fsS "http://${IP}/api/health" >/dev/null 2>&1; then
    echo ""
    echo "============================================"
    echo "  Museum kit READY"
    echo "  Dashboard / laptops:  http://${IP}/"
    echo "  API (Quest beacon):   http://${IP}:4000"
    echo "  WebGL:                http://${IP}/webgl/"
    echo "============================================"
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://${IP}/" >/dev/null 2>&1 || true
    fi
    exit 0
  fi
  sleep 2
done

echo "[museum-kit] ERROR: health check timed out"
docker compose --env-file .env --env-file runtime.env ps
exit 1
