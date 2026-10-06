#!/usr/bin/env bash
# Connect only to the closed kit SSID (prep: copy kit-wifi.env.example → kit-wifi.env).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ROOT}/kit-wifi.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[wifi] missing ${ENV_FILE} — copy kit-wifi.env.example and set KIT_SSID / KIT_PSK"
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

if [[ -z "${KIT_SSID:-}" ]]; then
  echo "[wifi] KIT_SSID required in kit-wifi.env"
  exit 1
fi

if ! command -v nmcli >/dev/null 2>&1; then
  echo "[wifi] nmcli not found — connect to ${KIT_SSID} via the desktop Wi‑Fi menu"
  exit 0
fi

echo "[wifi] connecting to ${KIT_SSID} only…"
# Rescan, then connect (PSK optional for open museum SSIDs)
if [[ -n "${KIT_PSK:-}" ]]; then
  nmcli device wifi connect "${KIT_SSID}" password "${KIT_PSK}" || \
    nmcli connection up "${KIT_SSID}" 2>/dev/null || true
else
  nmcli device wifi connect "${KIT_SSID}" || \
    nmcli connection up "${KIT_SSID}" 2>/dev/null || true
fi

# Optional: bring down other Wi‑Fi connections so kids cannot hop networks
if [[ "${KIT_DISCONNECT_OTHERS:-1}" == "1" ]]; then
  while read -r name; do
    [[ -z "${name}" || "${name}" == "${KIT_SSID}" ]] && continue
    nmcli connection down "${name}" 2>/dev/null || true
  done < <(nmcli -t -f NAME,TYPE connection show --active | awk -F: '$2=="802-11-wireless"{print $1}')
fi

echo "[wifi] active Wi‑Fi:"
nmcli -t -f NAME,DEVICE,TYPE connection show --active | grep wireless || true
