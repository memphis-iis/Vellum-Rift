#!/usr/bin/env bash
# Undo lock-desktop.sh (staff / prep).
set -euo pipefail

USER_HOME="${HOME}"
MARKER="${USER_HOME}/.config/vellum-desktop-locked"

restore_bak() {
  local f="$1"
  if [[ -f "${f}.vellum-bak" ]]; then
    mv -f "${f}.vellum-bak" "${f}"
  fi
}

echo "[desktop-unlock] restoring LXDE/LXQt configs…"

restore_bak "${USER_HOME}/.config/openbox/rc.xml"
restore_bak "${USER_HOME}/.config/openbox/lxde-rc.xml"

# Remove our mask autostarts (Hidden=true stubs)
for f in \
  lxpanel.desktop pcmanfm-desktop.desktop pcmanfm.desktop \
  nm-applet.desktop blueman.desktop \
  lxqt-panel.desktop pcmanfm-qt-desktop.desktop \
  lxqt-powermanagement.desktop lxqt-xscreensaver-autostart.desktop \
  lxqt-notifications.desktop snap-userd-autostart.desktop \
  xscreensaver.desktop light-locker.desktop update-notifier.desktop; do
  rm -f "${USER_HOME}/.config/autostart/${f}"
done

rm -f "${USER_HOME}/.config/lxqt/panel.conf"
rm -f "${USER_HOME}/.config/pcmanfm-qt/lxqt/settings.conf"
rm -f "${USER_HOME}/.local/share/applications/"{lxterminal,qterminal,xterm,gnome-terminal,xfce4-terminal,firefox,chromium-browser,chromium,lubuntu-software,synaptic,pcmanfm,pcmanfm-qt,featherpad,leafpad}.desktop

# Put join / observer shortcuts back for staff
if [[ -d /opt/vellum-client ]]; then
  mkdir -p "${USER_HOME}/Desktop"
  cp -f /opt/vellum-client/vellum-join.desktop "${USER_HOME}/Desktop/" 2>/dev/null || true
  cp -f /opt/vellum-client/vellum-observer.desktop "${USER_HOME}/Desktop/" 2>/dev/null || true
fi

rm -f "${MARKER}"
echo "[desktop-unlock] done. Log out/in. Also run: join-exhibit.sh unlock"
