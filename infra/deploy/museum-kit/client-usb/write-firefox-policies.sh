#!/usr/bin/env bash
# Write Firefox enterprise policies that allow only the museum host (elementary).
# Usage: write-firefox-policies.sh http://192.168.x.y/
set -euo pipefail

RAW="${1:-}"
HOST="$(printf '%s' "${RAW}" | sed -E 's#^[a-zA-Z]+://##' | cut -d'/' -f1 | cut -d':' -f1)"
[[ -n "${HOST}" ]] || exit 1

DEST_DIR="${2:-/etc/firefox/policies}"
TMP="$(mktemp)"
cat > "${TMP}" <<EOF
{
  "policies": {
    "BlockAboutConfig": true,
    "DisableFirefoxAccounts": true,
    "DisablePrivateBrowsing": true,
    "DisableProfileImport": true,
    "DontCheckDefaultBrowser": true,
    "Homepage": {
      "URL": "http://${HOST}/",
      "Locked": true,
      "StartPage": "homepage"
    },
    "OverrideFirstRunPage": "",
    "OverridePostUpdatePage": "",
    "WebsiteFilter": {
      "Block": ["<all_urls>"],
      "Exceptions": [
        "http://${HOST}/*",
        "http://${HOST}:*/*",
        "https://${HOST}/*",
        "https://${HOST}:*/*"
      ]
    }
  }
}
EOF

if [[ "$(id -u)" -eq 0 ]]; then
  mkdir -p "${DEST_DIR}"
  cp "${TMP}" "${DEST_DIR}/policies.json"
elif command -v sudo >/dev/null 2>&1; then
  sudo mkdir -p "${DEST_DIR}"
  sudo cp "${TMP}" "${DEST_DIR}/policies.json"
else
  echo "[firefox-policies] need root to install to ${DEST_DIR}" >&2
  rm -f "${TMP}"
  exit 1
fi
rm -f "${TMP}"
echo "[firefox-policies] locked Homepage + WebsiteFilter to ${HOST}"
