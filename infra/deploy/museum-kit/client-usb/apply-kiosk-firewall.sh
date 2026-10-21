#!/usr/bin/env bash
# Elementary lockdown: only talk to the museum host (+ DHCP/DNS/UDP beacon).
# Usage: apply-kiosk-firewall.sh <museum-host-or-url>
# Resolves FQDNs (e.g. iis.memphis.edu) to A/AAAA for iptables -d.
set -euo pipefail

RAW="${1:-}"
if [[ -z "${RAW}" ]]; then
  echo "usage: $0 https://iis.memphis.edu/...   OR   http://192.168.x.y/   OR   192.168.x.y" >&2
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

# Resolve hostname → IPv4/IPv6 (literal IPs pass through).
resolve_addrs() {
  local h="$1"
  local -a out=()
  if [[ "${h}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s\n' "${h}"
    return 0
  fi
  if [[ "${h}" =~ ^\[?[0-9a-fA-F:]+\]?$ ]] && [[ "${h}" == *:* ]]; then
    printf '%s\n' "${h}"
    return 0
  fi
  if command -v getent >/dev/null 2>&1; then
    while read -r ip _; do
      [[ -n "${ip}" ]] && out+=("${ip}")
    done < <(getent ahosts "${h}" 2>/dev/null | awk '{print $1}' | sort -u)
  fi
  if [[ ${#out[@]} -eq 0 ]] && command -v dig >/dev/null 2>&1; then
    while read -r ip; do
      [[ -n "${ip}" ]] && out+=("${ip}")
    done < <(dig +short A "${h}" 2>/dev/null; dig +short AAAA "${h}" 2>/dev/null)
  fi
  if [[ ${#out[@]} -eq 0 ]] && command -v python3 >/dev/null 2>&1; then
    while read -r ip; do
      [[ -n "${ip}" ]] && out+=("${ip}")
    done < <(python3 - "${h}" <<'PY'
import socket, sys
host = sys.argv[1]
seen = set()
for fam, _, _, _, sockaddr in socket.getaddrinfo(host, None):
    ip = sockaddr[0]
    if ip not in seen:
        seen.add(ip)
        print(ip)
PY
)
  fi
  if [[ ${#out[@]} -eq 0 ]]; then
    echo "[firewall] could not resolve ${h} — allowing by hostname (may fail on some kernels)" >&2
    printf '%s\n' "${h}"
    return 0
  fi
  printf '%s\n' "${out[@]}"
}

mapfile -t ADDRS < <(resolve_addrs "${HOST}")
ADDR_LIST="$(printf '%s,' "${ADDRS[@]}" | sed 's/,$//')"
echo "[firewall] locking outbound TCP to ${HOST} (${ADDR_LIST}) ports 80,443,4000,8080,9000 + DNS/DHCP/beacon"

CHAIN="VELLUM_KIOSK"
run iptables -N "${CHAIN}" 2>/dev/null || run iptables -F "${CHAIN}"

run iptables -A "${CHAIN}" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
run iptables -A "${CHAIN}" -o lo -j ACCEPT
run iptables -A "${CHAIN}" -p udp --dport 67:68 -j ACCEPT
run iptables -A "${CHAIN}" -p udp --sport 67:68 -j ACCEPT
run iptables -A "${CHAIN}" -p udp --dport 53 -j ACCEPT
run iptables -A "${CHAIN}" -p tcp --dport 53 -j ACCEPT
run iptables -A "${CHAIN}" -p udp --dport 41234 -j ACCEPT
run iptables -A "${CHAIN}" -p udp --sport 41234 -j ACCEPT

for addr in "${ADDRS[@]}"; do
  for p in 80 443 4000 8080 9000; do
    run iptables -A "${CHAIN}" -p tcp -d "${addr}" --dport "${p}" -j ACCEPT
  done
done
run iptables -A "${CHAIN}" -j DROP

if ! run iptables -C OUTPUT -j "${CHAIN}" 2>/dev/null; then
  run iptables -I OUTPUT 1 -j "${CHAIN}"
fi

# Cache last target for early-boot systemd oneshot
CACHE_DIR="/opt/vellum-client"
if [[ -d "${CACHE_DIR}" ]] || mkdir -p "${CACHE_DIR}" 2>/dev/null; then
  {
    echo "VELLUM_FIREWALL_HOST=${HOST}"
    echo "VELLUM_FIREWALL_ADDRS=${ADDR_LIST}"
  } | if [[ "$(id -u)" -eq 0 ]]; then
    cat > "${CACHE_DIR}/firewall.cache"
  elif command -v sudo >/dev/null 2>&1; then
    sudo tee "${CACHE_DIR}/firewall.cache" >/dev/null
  fi
fi

echo "[firewall] applied. Staff undo: sudo iptables -D OUTPUT -j ${CHAIN}; sudo iptables -F ${CHAIN}; sudo iptables -X ${CHAIN}"
