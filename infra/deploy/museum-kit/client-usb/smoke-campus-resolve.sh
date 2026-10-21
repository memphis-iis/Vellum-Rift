#!/usr/bin/env bash
# Dry-run: parse campus URL + resolve IPs (no iptables). Prep check before USB batch.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
URL="${1:-${VELLUM_MUSEUM_URL:-https://iis.memphis.edu/static/vellum-dashboard/?session=SESSION_ID&kiosk=1}}"
HOST="$(printf '%s' "${URL}" | sed -E 's#^[a-zA-Z]+://##' | cut -d'/' -f1 | cut -d':' -f1)"
echo "url=$URL"
echo "host=$HOST"
python3 - "$HOST" <<'PY'
import socket, sys
host = sys.argv[1]
ips = sorted({s[4][0] for s in socket.getaddrinfo(host, None)})
if not ips:
    sys.exit("resolve failed")
print("addrs=" + ",".join(ips))
PY
echo "OK — apply-kiosk-firewall.sh would allowlist these on 80/443/4000/8080/9000"
