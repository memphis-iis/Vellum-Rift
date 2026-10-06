#!/usr/bin/env bash
# Lock LXDE / LXQt (Lubuntu) for elementary kiosk: no panel toys, no desktop icons,
# cripple common escape keybinds. Staff: unlock-desktop.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
USER_HOME="${HOME}"
MARKER="${USER_HOME}/.config/vellum-desktop-locked"

backup_once() {
  local f="$1"
  [[ -f "${f}" && ! -f "${f}.vellum-bak" ]] || return 0
  cp -a "${f}" "${f}.vellum-bak"
}

echo "[desktop-lock] applying LXDE/LXQt kiosk lockdown under ${USER_HOME}"

mkdir -p \
  "${USER_HOME}/.config/openbox" \
  "${USER_HOME}/.config/lxpanel/LXDE/panels" \
  "${USER_HOME}/.config/lxsession/LXDE" \
  "${USER_HOME}/.config/pcmanfm/LXDE" \
  "${USER_HOME}/.config/lxqt" \
  "${USER_HOME}/.config/pcmanfm-qt/lxqt" \
  "${USER_HOME}/.config/autostart" \
  "${USER_HOME}/.local/share/applications"

# --- Openbox: strip dangerous keybinds (used by classic LXDE and some LXQt setups) ---
OB_RC="${USER_HOME}/.config/openbox/lxde-rc.xml"
if [[ ! -f "${OB_RC}" ]]; then
  OB_RC="${USER_HOME}/.config/openbox/rc.xml"
fi
backup_once "${OB_RC}" 2>/dev/null || true

# Minimal openbox rc that only allows Alt+F4 to close the focused window (staff exit from kiosk).
cat > "${USER_HOME}/.config/openbox/rc.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <resistance><strength>10</strength><screen_edge_strength>20</screen_edge_strength></resistance>
  <focus><focusNew>yes</focusNew><followMouse>no</followMouse></focus>
  <theme><name>Clearlooks</name><titleLayout>NLIMC</titleLayout></theme>
  <keyboard>
    <!-- Staff: close kiosk window -->
    <keybind key="A-F4"><action name="Close"/></keybind>
    <!-- Block common escape hatches -->
    <keybind key="C-A-T"><action name="Execute"><command>true</command></action></keybind>
    <keybind key="C-A-d"><action name="Execute"><command>true</command></action></keybind>
    <keybind key="A-F2"><action name="Execute"><command>true</command></action></keybind>
    <keybind key="C-Escape"><action name="Execute"><command>true</command></action></keybind>
    <keybind key="Super_L"><action name="Execute"><command>true</command></action></keybind>
    <keybind key="Super_R"><action name="Execute"><command>true</command></action></keybind>
  </keyboard>
  <mouse>
    <context name="Desktop">
      <mousebind button="Left" action="Press"/>
      <mousebind button="Right" action="Press"/>
      <mousebind button="Middle" action="Press"/>
    </context>
  </mouse>
  <applications>
    <application class="*"><maximized>yes</maximized><decor>no</decor></application>
  </applications>
</openbox_config>
XML
cp -f "${USER_HOME}/.config/openbox/rc.xml" "${USER_HOME}/.config/openbox/lxde-rc.xml"
cp -f "${USER_HOME}/.config/openbox/rc.xml" "${USER_HOME}/.config/openbox/lxqt-rc.xml"

# --- LXDE: empty panel + no desktop icons (pcmanfm) ---
cat > "${USER_HOME}/.config/lxpanel/LXDE/panels/panel" <<'EOF'
Global {
  edge=bottom
  allign=left
  margin=0
  widthtype=percent
  width=0
  height=0
  transparent=1
  autohide=1
  heightwhenhidden=0
  setdocktype=1
  setpartialstrut=0
  usefontcolor=0
  fontsize=10
  background=0
}
Plugin { type=space Config { Size=2 } }
EOF

cat > "${USER_HOME}/.config/pcmanfm/LXDE/desktop-items-0.conf" <<'EOF'
[*]
wallpaper_mode=color
desktop_bg=#1a1a1a
desktop_fg=#ffffff
desktop_shadow=#000000
show_documents=0
show_trash=0
show_mounts=0
show_wm_menu=0
EOF

# Prefer not managing desktop at all
cat > "${USER_HOME}/.config/pcmanfm/LXDE/pcmanfm.conf" <<'EOF'
[config]
bm_open_method=0

[desktop]
force_default=0
show_desktop=0
desktop_fg=#ffffff
desktop_bg=#1a1a1a
EOF

# LXDE session: do not start lxpanel/pcmanfm desktop if we can override autostart
mkdir -p "${USER_HOME}/.config/lxsession/LXDE"
cat > "${USER_HOME}/.config/lxsession/LXDE/desktop.conf" <<'EOF'
[Session]
window_manager=openbox-lxde
disable_autostart=no
EOF

# Disable noisy LXDE autostarts by masking with Hidden=true copies
mask_autostart() {
  local name="$1"
  cat > "${USER_HOME}/.config/autostart/${name}" <<EOF
[Desktop Entry]
Hidden=true
EOF
}
mask_autostart "lxpanel.desktop"
mask_autostart "pcmanfm-desktop.desktop"
mask_autostart "pcmanfm.desktop"
mask_autostart "xscreensaver.desktop"
mask_autostart "light-locker.desktop"
mask_autostart "update-notifier.desktop"
mask_autostart "nm-applet.desktop"
mask_autostart "blueman.desktop"
mask_autostart "screensaver-settings.desktop"

# Keep our join autostart
if [[ -f /opt/vellum-client/autostart/vellum-join.desktop ]]; then
  cp -f /opt/vellum-client/autostart/vellum-join.desktop "${USER_HOME}/.config/autostart/"
elif [[ -f "${ROOT}/autostart/vellum-join.desktop" ]]; then
  cp -f "${ROOT}/autostart/vellum-join.desktop" "${USER_HOME}/.config/autostart/"
fi

# --- LXQt (Lubuntu 24.04): hide panel, no desktop icons ---
cat > "${USER_HOME}/.config/lxqt/panel.conf" <<'EOF'
[General]
panels=__empty__

[panel1]
alignment=-1
animation-duration=0
hidable=true
visibleMargin=false
background-color=@Variant(\0\0\0\x43\x1\xff\xff\0\0\0\0\0\0\0\0)
opacity=0
panelSize=0
iconSize=0
lineCount=1
length=0
lengthInPercents=true
EOF

# Empty plugins list — some LXQt versions use modules.conf
cat > "${USER_HOME}/.config/lxqt/lxqt.conf" <<'EOF'
[General]
__user__=1
EOF

cat > "${USER_HOME}/.config/pcmanfm-qt/lxqt/settings.conf" <<'EOF'
[Desktop]
ShowHidden=false
ShowThumbnails=false
Wallpaper=
WallpaperMode=color
FgColor=#ffffff
BgColor=#1a1a1a
ShadowColor=#000000
DesktopCellMargins=@Size(3 1)
HideItems=true
ShowDocuments=false
ShowTrash=false
ShowMounts=false
EOF

mask_autostart "lxqt-panel.desktop"
mask_autostart "pcmanfm-qt-desktop.desktop"
mask_autostart "lxqt-powermanagement.desktop"
mask_autostart "lxqt-xscreensaver-autostart.desktop"
mask_autostart "lxqt-notifications.desktop"
mask_autostart "snap-userd-autostart.desktop"

# Remove desktop launchers students could double-click (keep nothing on Desktop)
rm -f "${USER_HOME}/Desktop/"*.desktop 2>/dev/null || true

# Hide common apps from menus (Does not block /usr/bin, but reduces browsing the menu)
for app in lxterminal qterminal xterm gnome-terminal xfce4-terminal \
  firefox chromium-browser chromium lubuntu-software synaptic \
  pcmanfm pcmanfm-qt featherpad leafpad; do
  cat > "${USER_HOME}/.local/share/applications/${app}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${app}
NoDisplay=true
Hidden=true
EOF
done

date -u +"%Y-%m-%dT%H:%M:%SZ" > "${MARKER}"
echo "[desktop-lock] done. Re-login (or reboot) for panel/desktop changes."
echo "[desktop-lock] Staff restore: /opt/vellum-client/unlock-desktop.sh"
