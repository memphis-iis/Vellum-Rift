#!/usr/bin/env bash
# Elementary lockdown: only talk to the museum-kit host (+ DHCP/DNS/UDP beacon).
# Usage: apply-kiosk-firewall.sh <museum-host-or-url>
set -euo pipefail

RAW="${1:-}"
if [[ -z "${RAW}" ]]; then
  echo "usage: $0 http://192.168.x.y/   OR   192.168.x.y" >&2
  exit 1
fi

HOST="$(printf '%s' "${RAW}" | sed -E 's#^[a-zA-Z]+://##' | cut -d'/' -f1 | cut -d':' -f1)"
if [[ -z "${HOST}" ]]; then
  echo "[firewall] could not parse host from: ${RAW}" >&2
  exit 1
fi

if ! command -v iptables >/dev/null 2>&1; then
  echo "[firewall] iptables not found — skip (install iptables or use router no-WAN only)"
  exit 0
fi

run() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "[firewall] need root to apply rules" >&2
    exit 1
  fi
}

echo "[firewall] locking outbound TCP to ${HOST} (80,4000,8080,9000) + DNS/DHCP/beacon"

# Flush only our chain if present; otherwise create a dedicated chain and jump.
CHAIN="VELLUM_KIOSK"
run iptables -N "${CHAIN}" 2>/dev/null || run iptables -F "${CHAIN}"

# Allow established
run iptables -A "${CHAIN}" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Loopback
run iptables -A "${CHAIN}" -o lo -j ACCEPT
# DHCP
run iptables -A "${CHAIN}" -p udp --dport 67:68 -j ACCEPT
run iptables -A "${CHAIN}" -p udp --sport 67:68 -j ACCEPT
# DNS (router / any — needed before we know names; kit is usually IP-only)
run iptables -A "${CHAIN}" -p udp --dport 53 -j ACCEPT
run iptables -A "${CHAIN}" -p tcp --dport 53 -j ACCEPT
# Museum discovery beacon (inbound listen uses local bind; outbound not required)
run iptables -A "${CHAIN}" -p udp --dport 41234 -j ACCEPT
run iptables -A "${CHAIN}" -p udp --sport 41234 -j ACCEPT
# Museum exhibit ports only (edge :80, API, WebGL direct, MinIO signed URLs)
for p in 80 443 4000 8080 9000; do
  run iptables -A "${CHAIN}" -p tcp -d "${HOST}" --dport "${p}" -j ACCEPT
done
# Drop everything else from this chain
run iptables -A "${CHAIN}" -j DROP

# Ensure OUTPUT jumps to our chain once
if ! run iptables -C OUTPUT -j "${CHAIN}" 2>/dev/null; then
  run iptables -I OUTPUT 1 -j "${CHAIN}"
fi

echo "[firewall] applied. Staff undo: sudo iptables -D OUTPUT -j ${CHAIN}; sudo iptables -F ${CHAIN}; sudo iptables -X ${CHAIN}"
