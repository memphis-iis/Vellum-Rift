# Museum kit — lightweight **client** USB

For **laptop explorers** and optional **wall observer** PCs.  
Does **not** run Docker or host WebGL — the browser loads Unity WebGL from the **server** over kit Wi‑Fi.

**Elementary default:** full-screen **kiosk** + firewall allowlist so the stick only reaches the museum host (not the open web). Still put the kit router **offline (no WAN)**.

Server kit: [../README.md](../README.md). Show-day: [docs/qa/museum-kit-runbook.md](../../../../docs/qa/museum-kit-runbook.md).

## What’s on the stick (~MB, not GB)

| Item | Purpose |
|------|---------|
| Lubuntu 24.04 LTS live (Ventoy) | Boot + Wi‑Fi + browser (recommended for Dell Precision 3590) |
| `join-exhibit.sh` | Wi‑Fi → UDP discover → kiosk browser + firewall |
| `kit-wifi.env` | Locked SSID for the closed classroom router |
| Desktop / autostart | Auto **Join** in kiosk mode |

**Not included:** Unity Editor, WebGL build files, Postgres, Docker images.

## Elementary lockdown (layers)

1. **Router:** no WAN on show day (kids cannot reach the internet even if something bypasses the client).
2. **Wi‑Fi:** `connect-kit-wifi.sh` joins only `KIT_SSID` from `kit-wifi.env` and can drop other Wi‑Fi profiles.
3. **Firewall:** `apply-kiosk-firewall.sh` allows DHCP/DNS + TCP to the museum IP on **80 / 4000 / 8080 / 9000** only (drops other outbound).
4. **Browser kiosk:** Chromium `--kiosk --app=…` or Firefox `--kiosk` + optional `WebsiteFilter` policies for that host.
5. **LXDE / LXQt desktop:** `lock-desktop.sh` (run by `install-to-live.sh`) hides the panel, disables desktop icons/right-click menu, masks panel/file-manager autostarts, hides terminal/browser entries from menus, and replaces Openbox keybinds so **Ctrl+Alt+T / Alt+F2 / Super** do nothing. **Alt+F4** still closes the kiosk for staff.

Staff exit: `Alt+F4` → `/opt/vellum-client/join-exhibit.sh unlock` → optional `/opt/vellum-client/unlock-desktop.sh` + re-login. Host laptop stays unlocked for Event / help / turn timer.

**Note:** Lubuntu **24.04 uses LXQt** (not classic LXDE). The lock script covers **both** LXDE and LXQt. This is still not a hardened jail (TTY/console and persistence root can bypass it); fine for elementary with no WAN and adult spotting.

## Prep (once per batch of sticks)

1. Flash [Ventoy](https://www.ventoy.net/) on an 8–16 GB USB; use **Lubuntu 24.04 LTS** live + persistence.
2. From this repo:

   ```bash
   cd infra/deploy/museum-kit/client-usb
   ./pack-client-usb.sh
   # copy dist/vellum-client/ onto the persistence volume
   ```

3. Boot once, run `./install-to-live.sh` (installs files + **locks LXDE/LXQt**).
4. Edit `/opt/vellum-client/kit-wifi.env` (`KIT_SSID`, optional `KIT_PSK`).
5. Reboot; confirm: no panel/icons, kiosk only, blocked URL fails, Ctrl+Alt+T does nothing.
6. Clone the persistence recipe across client sticks.

Disable kiosk for staff debugging: `VELLUM_KIOSK=0 /opt/vellum-client/join-exhibit.sh`  
Restore desktop: `/opt/vellum-client/unlock-desktop.sh` then log out/in.

## Show day (Station 2 — laptop)

1. Boot client USB → autostart connects kit Wi‑Fi → discovers server → **kiosk**.
2. Student: nametag → **Enter 3D** only.
3. If discovery misses (rare): staff runs  
   `VELLUM_MUSEUM_URL=http://192.168.x.y/ /opt/vellum-client/join-exhibit.sh`

## Show day (Station 4 — wall observer)

Same lockdown; use **Vellum Wall Observer**, then host **Observer → Open display**.

## Failure card

| Symptom | Fix |
|---------|-----|
| No beacon | Server not up / wrong SSID / AP isolation |
| Kiosk but no WebGL | Allow :9000 (MinIO) — re-run join after server READY |
| Need staff browser | `join-exhibit.sh unlock` then `VELLUM_KIOSK=0 join-exhibit.sh` |
| Stale IP | Delete `/opt/vellum-client/server.url` and re-run join |
