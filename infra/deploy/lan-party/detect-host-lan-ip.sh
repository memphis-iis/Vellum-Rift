#!/usr/bin/env bash
# Primary LAN/Wi‑Fi IPv4 for dnsmasq bind + sinkhole (not docker/lo; tailscale last resort).
set -euo pipefail

_iface_skipped() {
  local d=$1
  [[ "$d" == lo ]] && return 0
  [[ "$d" == docker* || "$d" == br-* || "$d" == veth* ]] && return 0
  return 1
}

_list_global_v4() {
  ip -4 -o addr show scope global 2>/dev/null | while read -r _ dev _ cidr _; do
    dev=${dev%@*}
    _iface_skipped "$dev" && continue
    echo "${dev} ${cidr%%/*}"
  done
}

detect_host_lan_ipv4() {
  local out dev src

  if out=$(ip -4 route get 1.1.1.1 2>/dev/null); then
    dev=$(awk '{for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit }}' <<<"$out")
    src=$(awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}' <<<"$out")
    if [[ -n "$src" && -n "$dev" ]] && ! _iface_skipped "$dev" && [[ "$dev" != tailscale0 ]]; then
      echo "$src"
      return 0
    fi
  fi

  local line d ip
  while read -r d ip; do
    [[ "$d" != tailscale0 ]] || continue
    echo "$ip"
    return 0
  done < <(_list_global_v4)

  while read -r d ip; do
    [[ "$d" == tailscale0 ]] || continue
    echo "$ip"
    return 0
  done < <(_list_global_v4)

  return 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  detect_host_lan_ipv4
fi
