#!/usr/bin/env bash
# Write Firefox enterprise policies that allow only the museum host (elementary).
# Campus HTTPS: path-scoped exceptions for dashboard / WebGL / API only.
# Usage: write-firefox-policies.sh <museum-url>
# Optional: VELLUM_FIREFOX_PATH_SCOPE=1 (default on for https:// hosts)
set -euo pipefail

RAW="${1:-}"
[[ -n "${RAW}" ]] || exit 1

HOST="$(printf '%s' "${RAW}" | sed -E 's#^[a-zA-Z]+://##' | cut -d'/' -f1 | cut -d':' -f1)"
[[ -n "${HOST}" ]] || exit 1

SCHEME="http"
if [[ "${RAW}" =~ ^https:// ]]; then
  SCHEME="https"
fi

# Prefer full URL for Homepage when provided; else scheme://host/
HOMEPAGE="${RAW}"
if [[ "${HOMEPAGE}" != http*://* ]]; then
  HOMEPAGE="${SCHEME}://${HOST}/"
fi

PATH_SCOPE="${VELLUM_FIREFOX_PATH_SCOPE:-}"
if [[ -z "${PATH_SCOPE}" ]]; then
  if [[ "${SCHEME}" == "https" ]]; then
    PATH_SCOPE=1
  else
    PATH_SCOPE=0
  fi
fi

DEST_DIR="${2:-/etc/firefox/policies}"
TMP="$(mktemp)"

if [[ "${PATH_SCOPE}" == "1" ]]; then
  cat > "${TMP}" <<EOF
{
  "policies": {
    "BlockAboutConfig": true,
    "DisableFirefoxAccounts": true,
    "DisablePrivateBrowsing": true,
    "DisableProfileImport": true,
    "DontCheckDefaultBrowser": true,
    "Homepage": {
      "URL": "${HOMEPAGE}",
      "Locked": true,
      "StartPage": "homepage"
    },
    "OverrideFirstRunPage": "",
    "OverridePostUpdatePage": "",
    "WebsiteFilter": {
      "Block": ["<all_urls>"],
      "Exceptions": [
        "https://${HOST}/static/vellum-dashboard/*",
        "https://${HOST}/static/vellum-dashboard*",
        "https://${HOST}/vellumrift/*",
        "https://${HOST}/vellumrift*",
        "https://${HOST}/apis/vellumrift/*",
        "https://${HOST}/apis/vellumrift*"
      ]
    }
  }
}
EOF
  echo "[firefox-policies] path-scoped WebsiteFilter for ${HOST} (campus)"
else
  cat > "${TMP}" <<EOF
{
  "policies": {
    "BlockAboutConfig": true,
    "DisableFirefoxAccounts": true,
    "DisablePrivateBrowsing": true,
    "DisableProfileImport": true,
    "DontCheckDefaultBrowser": true,
    "Homepage": {
      "URL": "${HOMEPAGE}",
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
  echo "[firefox-policies] host-wide WebsiteFilter for ${HOST} (LAN kit)"
fi

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
echo "[firefox-policies] locked Homepage + WebsiteFilter → ${HOMEPAGE}"
