#!/usr/bin/env bash
# Stage a lightweight client USB payload (no Docker, no WebGL binaries).
# Drop onto Ventoy persistence or any Linux live at /opt/vellum-client.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-${ROOT}/dist/vellum-client}"
mkdir -p "${OUT}/autostart"

cp -f "${ROOT}/join-exhibit.sh" "${OUT}/"
cp -f "${ROOT}/connect-kit-wifi.sh" "${OUT}/"
cp -f "${ROOT}/apply-kiosk-firewall.sh" "${OUT}/"
cp -f "${ROOT}/write-firefox-policies.sh" "${OUT}/"
cp -f "${ROOT}/lock-desktop.sh" "${OUT}/"
cp -f "${ROOT}/unlock-desktop.sh" "${OUT}/"
cp -f "${ROOT}/kit-wifi.env.example" "${OUT}/"
cp -f "${ROOT}/firefox-policies.template.json" "${OUT}/"
cp -f "${ROOT}/vellum-join.desktop" "${OUT}/"
cp -f "${ROOT}/vellum-observer.desktop" "${OUT}/"
cp -f "${ROOT}/autostart/vellum-join.desktop" "${OUT}/autostart/"
cp -f "${ROOT}/README.md" "${OUT}/"
chmod +x "${OUT}/"*.sh

cat > "${OUT}/install-to-live.sh" <<'EOF'
#!/usr/bin/env bash
# Run once inside the live Linux session (with persistence).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
sudo mkdir -p /opt/vellum-client
sudo cp -a "${SRC}/." /opt/vellum-client/
sudo chmod +x /opt/vellum-client/*.sh
if [[ -f /opt/vellum-client/kit-wifi.env.example && ! -f /opt/vellum-client/kit-wifi.env ]]; then
  sudo cp /opt/vellum-client/kit-wifi.env.example /opt/vellum-client/kit-wifi.env
  echo "Edit /opt/vellum-client/kit-wifi.env with the kit SSID (and PSK if any)."
fi
mkdir -p "${HOME}/.config/autostart"
cp -f /opt/vellum-client/autostart/vellum-join.desktop "${HOME}/.config/autostart/"
# LXDE / LXQt lockdown (no panel, no desktop icons, blocked terminal shortcuts)
bash /opt/vellum-client/lock-desktop.sh
echo "Installed (elementary kiosk + desktop lock). Reboot, then verify kiosk."
echo "Staff unlock desktop: /opt/vellum-client/unlock-desktop.sh"
EOF
chmod +x "${OUT}/install-to-live.sh"

echo "[pack-client-usb] staged → ${OUT}"
echo "  Copy ${OUT}/ onto the client Ventoy persistence volume, then run install-to-live.sh once."
