# Museum kit — lightweight **client** USB

For **laptop explorers** and optional **wall observer** PCs.  
Does **not** run Docker or host WebGL — the browser loads Unity WebGL from the **server**.

**Two modes:**

| Mode | Network | Config |
|------|---------|--------|
| **LAN kit** (default) | Closed kit Wi‑Fi + UDP discover | `kit-wifi.env` |
| **Campus** | School/campus Wi‑Fi → `iis.memphis.edu` | `campus.env` (from `campus.env.example`) |

**Elementary default:** full-screen **kiosk** + firewall allowlist so the stick only reaches the museum host (not the open web). LAN kit: still put the kit router **offline (no WAN)**. Campus: client firewall + Firefox path filter are the barrier.

Server kit: [../README.md](../README.md). Show-day: [docs/qa/museum-kit-runbook.md](../../../../docs/qa/museum-kit-runbook.md). Campus classroom: [docs/qa/classroom-museum-runbook.md](../../../../docs/qa/classroom-museum-runbook.md#campus--iismemphisedu).

## What’s on the stick (~MB, not GB)

| Item | Purpose |
|------|---------|
| Lubuntu 24.04 LTS live (Ventoy) | Boot + Wi‑Fi + browser (recommended for Dell Precision 3590) |
| `join-exhibit.sh` | Wi‑Fi / pinned URL → kiosk browser + firewall |
| `kit-wifi.env` | Locked SSID for the closed classroom router (LAN) |
| `campus.env` | Pinned IIS kiosk URL; skip kit Wi‑Fi + discover |
| Desktop / autostart | Auto **Join** in kiosk mode |
| `vellum-kiosk-firewall.service` | Optional early-boot allowlist before the browser |

**Not included:** Unity Editor, WebGL build files, Postgres, Docker images.

## Elementary lockdown (layers)

1. **Router (LAN only):** no WAN on show day.
2. **Wi‑Fi (LAN):** `connect-kit-wifi.sh` joins only `KIT_SSID`. Campus: `VELLUM_CONNECT_WIFI=0`.
3. **Firewall:** `apply-kiosk-firewall.sh` resolves the museum host to IP(s), allows DHCP/DNS + TCP on **80 / 443 / 4000 / 8080 / 9000**, drops other outbound.
4. **Browser kiosk:** Chromium `--kiosk --app=…` or Firefox `--kiosk` + policies.
5. **Firefox WebsiteFilter:** LAN = whole museum host; **campus HTTPS** = path allowlist only (`/static/vellum-dashboard/*`, `/vellumrift/*`, `/apis/vellumrift/*`).
6. **LXDE / LXQt desktop:** `lock-desktop.sh` — no panel/terminal shortcuts. **Alt+F4** still closes the kiosk for staff.

Staff exit: `Alt+F4` → `/opt/vellum-client/join-exhibit.sh unlock` → optional `/opt/vellum-client/unlock-desktop.sh` + re-login. Host laptop stays unlocked for Event / help / turn timer.

**Note:** Lubuntu **24.04 uses LXQt**. Not a hardened jail (TTY/console and persistence root can bypass); fine for elementary with adult spotting.

## Campus USB — internet only to iis.memphis.edu

1. After `install-to-live.sh`:
   ```bash
   sudo cp /opt/vellum-client/campus.env.example /opt/vellum-client/campus.env
   sudo nano /opt/vellum-client/campus.env   # set SESSION_ID in VELLUM_MUSEUM_URL
   ```
2. Join campus/school Wi‑Fi (staff). Autostart loads `campus.env` → firewall to resolved IIS IPs → kiosk.
3. Smoke: open web (e.g. `https://example.com`) fails; kiosk nametag → **Enter 3D** works; **Alt+F4** + `join-exhibit.sh unlock` recovers staff.

Early boot: `install-to-live.sh` enables `vellum-kiosk-firewall.service` so the allowlist applies when `campus.env` / `server.url` exists, even if a student kills the browser.

## Prep (once per batch of sticks)

1. Flash [Ventoy](https://www.ventoy.net/) on an 8–16 GB USB; use **Lubuntu 24.04 LTS** live + persistence.
2. From this repo:

   ```bash
   cd infra/deploy/museum-kit/client-usb
   ./pack-client-usb.sh
   # copy dist/vellum-client/ onto the persistence volume
   ```

3. Boot once, run `./install-to-live.sh` (installs files + **locks LXDE/LXQt**).
4. **LAN:** edit `/opt/vellum-client/kit-wifi.env`. **Campus:** copy/edit `campus.env` (skip kit Wi‑Fi).
5. Reboot; confirm: no panel/icons, kiosk only, blocked URL fails, Ctrl+Alt+T does nothing.
6. Clone the persistence recipe across client sticks.

Disable kiosk for staff debugging: `VELLUM_KIOSK=0 /opt/vellum-client/join-exhibit.sh`  
Restore desktop: `/opt/vellum-client/unlock-desktop.sh` then log out/in.

## Show day (Station 2 — laptop)

**LAN:** Boot client USB → kit Wi‑Fi → discover → **kiosk** → nametag → **Enter 3D**.

**Campus:** Boot → campus Wi‑Fi → pinned IIS kiosk URL → same student flow.

If discovery misses (LAN): staff runs  
`VELLUM_MUSEUM_URL=http://192.168.x.y/ /opt/vellum-client/join-exhibit.sh`

## Show day (Station 4 — wall observer)

Same lockdown; use **Vellum Wall Observer**, then host **Observer → Open display**.

## Failure card

| Symptom | Fix |
|---------|-----|
| No beacon | Server not up / wrong SSID / AP isolation (LAN) |
| Campus kiosk blank | Missing/wrong `campus.env` `VELLUM_MUSEUM_URL` / session id |
| Kiosk but no WebGL | Allow :9000 (MinIO) on LAN; campus: confirm `/vellumrift/` trailing slash |
| Need staff browser | `join-exhibit.sh unlock` then `VELLUM_KIOSK=0 join-exhibit.sh` |
| Stale IP | Delete `/opt/vellum-client/server.url` and re-run join |
| Firewall DNS fail | Ensure UDP/TCP 53 allowed (script does); re-run after DNS works |
