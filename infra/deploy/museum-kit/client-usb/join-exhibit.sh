#!/usr/bin/env bash
# Lightweight client: find museum-kit server on LAN, open dashboard/WebGL in a browser.
# Elementary default: full-screen kiosk + optional firewall allowlist to museum host only.
# No Docker, no Unity — WebGL loads from the server over Wi‑Fi.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DISCOVER_PORT="${DISCOVER_PORT:-41234}"
LISTEN_SECONDS="${LISTEN_SECONDS:-4}"
MODE="${1:-join}" # join | observer | unlock
OVERRIDE_URL="${VELLUM_MUSEUM_URL:-}"
CACHE_FILE="${ROOT}/server.url"
# Elementary lockdown on by default for join/observer
KIOSK="${VELLUM_KIOSK:-1}"
APPLY_FIREWALL="${VELLUM_KIOSK_FIREWALL:-1}"
CONNECT_WIFI="${VELLUM_CONNECT_WIFI:-1}"

pick_browser() {
  for b in chromium-browser chromium google-chrome firefox brave-browser; do
    if command -v "$b" >/dev/null 2>&1; then
      printf '%s' "$b"
      return 0
    fi
  done
  return 1
}

discover_via_udp() {
  python3 - "$DISCOVER_PORT" "$LISTEN_SECONDS" <<'PY'
import json, socket, sys, time
port = int(sys.argv[1])
seconds = float(sys.argv[2])
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("", port))
except OSError as e:
    sys.stderr.write(f"bind failed: {e}\n")
    sys.exit(2)
sock.settimeout(0.25)
deadline = time.time() + seconds
while time.time() < deadline:
    try:
        data, _ = sock.recvfrom(4096)
    except socket.timeout:
        continue
    try:
        msg = json.loads(data.decode("utf-8", errors="ignore"))
    except Exception:
        continue
    if msg.get("service") != "vellum-rift":
        continue
    dash = (msg.get("dashboard") or "").strip()
    api = (msg.get("apiBase") or "").strip().rstrip("/")
    if dash:
        print(dash)
        sys.exit(0)
    if api:
        host = api.split("://", 1)[-1].split("/")[0].split(":")[0]
        print(f"http://{host}/")
        sys.exit(0)
sys.exit(1)
PY
}

resolve_url() {
  if [[ -n "${OVERRIDE_URL}" ]]; then
    printf '%s' "${OVERRIDE_URL}"
    return 0
  fi
  if url="$(discover_via_udp 2>/dev/null)"; then
    printf '%s' "${url}"
    return 0
  fi
  if [[ -f "${CACHE_FILE}" ]]; then
    local cached
    cached="$(tr -d '[:space:]' < "${CACHE_FILE}")"
    if [[ -n "${cached}" ]]; then
      printf '%s' "${cached}"
      return 0
    fi
  fi
  return 1
}

open_kiosk() {
  local url="$1"
  local browser
  if ! browser="$(pick_browser)"; then
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "${url}" >/dev/null 2>&1 &
      return 0
    fi
    echo "[client-usb] No browser found. Open manually: ${url}"
    return 1
  fi

  case "${browser}" in
    chromium*|google-chrome*|brave-browser)
      # App/kiosk: no address bar; students stay on the launched URL surface.
      "${browser}" \
        --kiosk \
        --app="${url}" \
        --no-first-run \
        --disable-session-crashed-bubble \
        --disable-infobars \
        --check-for-update-interval=31536000 \
        >/dev/null 2>&1 &
      ;;
    firefox)
      # Full-screen kiosk; pair with policies.json when installed under /etc/firefox/policies
      firefox --kiosk "${url}" >/dev/null 2>&1 &
      ;;
    *)
      "${browser}" --new-window "${url}" >/dev/null 2>&1 &
      ;;
  esac
}

open_unlocked() {
  local url="$1"
  local browser
  if browser="$(pick_browser)"; then
    "${browser}" --new-window "${url}" >/dev/null 2>&1 &
    return 0
  fi
  xdg-open "${url}" >/dev/null 2>&1 &
}

if [[ "${MODE}" == "unlock" ]]; then
  echo "[client-usb] staff unlock — removing kiosk firewall chain if present"
  if command -v iptables >/dev/null 2>&1; then
    sudo iptables -D OUTPUT -j VELLUM_KIOSK 2>/dev/null || true
    sudo iptables -F VELLUM_KIOSK 2>/dev/null || true
    sudo iptables -X VELLUM_KIOSK 2>/dev/null || true
  fi
  echo "[client-usb] firewall cleared. Browser exit: Alt+F4 (Chromium kiosk) or Ctrl+Shift+W."
  exit 0
fi

if [[ "${CONNECT_WIFI}" == "1" && -f "${ROOT}/kit-wifi.env" ]]; then
  bash "${ROOT}/connect-kit-wifi.sh" || true
fi

echo "[client-usb] mode=${MODE} kiosk=${KIOSK} — looking for museum server (UDP ${DISCOVER_PORT})…"

URL=""
if URL="$(resolve_url)"; then
  echo "${URL}" > "${CACHE_FILE}"
  echo "[client-usb] server: ${URL}"
else
  echo "[client-usb] No beacon yet."
  echo "  1) Join the kit Wi‑Fi"
  echo "  2) Wait for the server READY banner, then re-run"
  echo "  3) Or: VELLUM_MUSEUM_URL=http://192.168.x.y/ $0 ${MODE}"
  if [[ -t 0 && "${KIOSK}" != "1" ]]; then
    read -r -p "Server URL (http://…/): " URL || true
  fi
  if [[ -z "${URL:-}" ]]; then
    exit 1
  fi
  echo "${URL}" > "${CACHE_FILE}"
fi

if [[ "${APPLY_FIREWALL}" == "1" && "${KIOSK}" == "1" ]]; then
  bash "${ROOT}/apply-kiosk-firewall.sh" "${URL}" || true
fi

if [[ "${KIOSK}" == "1" ]] && command -v firefox >/dev/null 2>&1; then
  bash "${ROOT}/write-firefox-policies.sh" "${URL}" || true
fi

if [[ "${KIOSK}" == "1" ]]; then
  open_kiosk "${URL}"
  echo "[client-usb] kiosk launched (elementary lockdown)."
  echo "[client-usb] Staff exit: Alt+F4, then /opt/vellum-client/join-exhibit.sh unlock"
else
  open_unlocked "${URL}"
  echo "[client-usb] browser launched (unlocked)."
fi

if [[ "${MODE}" == "observer" ]]; then
  echo "[client-usb] Wall: host Lobby → Observer → Open display (paste link if needed)."
fi
