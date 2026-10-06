# Museum kit — set-and-forget show-day runbook

**Audience:** facilitators running an air-gapped demo with Quest 2, laptop explorers, a host dashboard, and a wall observer screen.

**Two deploy modes (both supported):**

| Mode | When | Base URL |
|------|------|----------|
| **Museum kit (USB)** | Server DHCP IP may change | `http://<detected-ip>/` (edge :80) — printed by `start-museum-kit.sh` |
| **Lan-party (current)** | You pin `SERVER_LAN_IP` | `http://<SERVER_LAN_IP>:5173` — [lan-party-runbook.md](lan-party-runbook.md) |

Guest join / observer deep links: [museum-guest-entry.md](museum-guest-entry.md). Classroom tape/rotation: [classroom-museum-runbook.md](classroom-museum-runbook.md).

Deploy code: [infra/deploy/museum-kit/README.md](../../infra/deploy/museum-kit/README.md).

---

## Four stations

```
  [Router — closed Wi‑Fi]     [Station 1: Dashboard server / host]
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
  [Station 3: Quest 2]     [Station 2: Laptop clients]    [Station 4: Wall observer]
```

### Station 1 — Dashboard server (host)

**Role:** runs the stack; enables the exhibit; watches **Call for help** + **Turn timer**.

| Kit | Lan-party (current) |
|-----|---------------------|
| Boot USB / run `./start-museum-kit.sh` | `cd infra/deploy/lan-party && docker compose up -d` |
| Wait for READY banner with detected IP | Health: `:4000` / `:5173` / `:8080` |
| Open `http://<ip>/` | Open `DASHBOARD_PUBLIC_URL` |

Then every show:

1. **Continue as local developer** (no Bluekey on air-gap).
2. Open the prepared **Space** → Enter lobby.
3. **Kiosk on** + Space marked **Event** (Quest event list).
4. Keep the **Enter** tab open for help alerts and turn timer.
5. Share today’s base URL / QR with stations 2 and 4 (kit: on-screen IP; lan-party: known `.env` IP).

**Smoke:** `curl -fsS http://<base>/api/health` (kit via :80) or `http://<SERVER_LAN_IP>:4000/api/health`.

### Station 2 — Dashboard client (laptop explorers)

**Role:** browser guests in WebGL (no Unity/Docker on the laptop).

**Preferred:** lightweight **client USB** — [infra/deploy/museum-kit/client-usb/README.md](../../infra/deploy/museum-kit/client-usb/README.md) (**elementary kiosk** by default: full-screen browser + firewall allowlist to the museum host only; kit router should have **no WAN**):

1. Boot client USB → joins **kit SSID** only (`kit-wifi.env`).
2. Autostart discovers the server → **kiosk** (no address bar / general browsing).
3. Nametag → **Enter 3D** (WebGL streams from the server over Wi‑Fi).

Staff unlock: `Alt+F4`, then `/opt/vellum-client/join-exhibit.sh unlock`.

**Without client USB:** any browser on kit Wi‑Fi → open today’s URL/QR (not recommended for elementary).

| Kit | Lan-party |
|-----|-----------|
| `http://<detected-ip>/` (or discovery) | `http://<SERVER_LAN_IP>:5173` |

**Smoke:** one laptop loads WebGL and joins the Space.

### Station 3 — Quest 2

**Role:** headset explorers.

1. Join kit Wi‑Fi.
2. Launch museum APK.
3. **Kit / discovery APK:** listens for UDP beacon → health → event list.  
   **Current baked APK:** uses `VELLUM_BUILD_BACKEND_URL=http://<SERVER_LAN_IP>:4000` (still valid; no discovery required).
4. Pick the exhibit event → enter Space.
5. Brief: **left Y = Call for help**; wrist **MENU → LOG OUT** between rotations; Guardian inside taped rectangle.

**Smoke:** one headset sees the event and enters.

Optional beacon on classic lan-party:

```bash
cd infra/deploy/lan-party
docker compose -f docker-compose.yml -f docker-compose.discover.yml up -d
```

### Station 4 — Wall screen observer

**Role:** peer / audience view on Lobby PC + HDMI / projector.

1. Same Wi‑Fi as the server (boot **client USB** in observer mode, or any browser).
2. Open dashboard via discovery / printed IP, or desktop **Vellum Wall Observer**.
3. From host Space lobby: **Observer** → **Open display**, or Host tools → **Copy observer link** (`spectator=1`, `unityHud=1`).
4. Full-screen that URL on the wall PC.
5. Optional: press **H** in WebGL to hide chrome for a clean wall view.

**Smoke:** wall shows the Space (freecam / gallery screen) without publishing a player pose.

---

## Prep day (internet OK) — once per release

### Museum kit USB

1. Closed router: no client isolation; WAN optional for prep only.
2. Build WebGL museum client; copy into `infra/deploy/lan-party/webgl/`.
3. Build Quest APK with `VELLUM_BUILD_ALLOW_INSECURE_HTTP=1` (omit venue IP bake for discovery-first, or bake a fallback).
4. `cd infra/deploy/museum-kit && ./build-kit.sh` — **server** USB payload.
5. `cd client-usb && ./pack-client-usb.sh` — **client** sticks (browser + Wi‑Fi only); install onto Ventoy persistence per [client-usb/README.md](../../infra/deploy/museum-kit/client-usb/README.md).
6. Ventoy **server** USB + persistence: install Docker; copy kit to `/opt/vellum-museum-kit`; autostart `./start-museum-kit.sh`.
7. Boot server once online: load images, ingest manuscripts, Event + Kiosk on, `./seed-export.sh`.
8. Offline dry run: unplug WAN, reboot server + one client USB + one Quest; confirm all **four stations**.

### Lan-party (unchanged)

Follow [lan-party-runbook.md](lan-party-runbook.md) § prep — set `SERVER_LAN_IP`, bake `VITE_*`, sideload baked Quest APK.

---

## Show day — set and forget

```text
Power router → power server
  → Station 1 ready (dashboard + Event + Kiosk + Enter tab)
  → Station 4 observer link on wall
  → Station 3 one Quest smoke
  → Station 2 one laptop smoke
  → Open floor / rotations
```

Tear-down: power off. Kit volumes persist on USB if configured.

---

## Failure card (per station)

| Station | Typical break | Fix |
|---------|---------------|-----|
| **1 Server/host** | Stack not healthy; Event/kiosk off; left Enter tab | Re-run start / compose; enable kiosk+Event; reopen Enter |
| **2 Laptop** | Stale bookmark / wrong IP; wrong SSID; client USB no browser | Use **today’s** URL or re-run `join-exhibit.sh`; kit Wi‑Fi; install Firefox into persistence |
| **3 Quest 2** | Wrong SSID; AP isolation (no beacon); empty events; APK without insecure HTTP | Same SSID; disable isolation; seed Event+kiosk; rebuild APK |
| **4 Wall observer** | Opened Play not Observer; bad link; display offline | Use Observer / copy observer link; same Wi‑Fi |

---

## Related

- [lan-party-runbook.md](lan-party-runbook.md) — fixed-IP compose path
- [classroom-museum-runbook.md](classroom-museum-runbook.md) — tape, hygiene, rotations
- [museum-guest-entry.md](museum-guest-entry.md) — kiosk QR + observer details
- [quest-museum-verify.md](quest-museum-verify.md) — headset UX checklist
