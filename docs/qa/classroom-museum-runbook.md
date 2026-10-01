# Classroom museum visit — facilitator runbook

**Audience:** teachers, museum educators, and volunteers running Vellum Rift with **elementary and middle school** students.

**Scenario:** one **offline LAN server**, student/staff **laptops**, **2–3 Meta Quest 2** headsets, classroom with tables, taped play boundaries, and **no internet on show day** after prep.

Technical stack and ports: [lan-party-runbook.md](lan-party-runbook.md). Guest join paths: [museum-guest-entry.md](museum-guest-entry.md).

---

## Before the visit / prep day (internet OK)

Complete this while you can reach GitHub, Docker Hub, Unity build machines, and manuscript sources.

### Software and artifacts

- [ ] Pull latest `main` (or your release tag) and the **lan-party** compose profile: [infra/deploy/lan-party/README.md](../../infra/deploy/lan-party/README.md).
- [ ] Copy `infra/deploy/lan-party/.env.example` → `.env`; set `SERVER_LAN_IP` and matching `VITE_*` / `DASHBOARD_PUBLIC_URL` for the classroom router.
- [ ] Pull or build Docker images (**Postgres**, **Silo**, **backend**, **dashboard**, **WebGL** nginx) while online.
- [ ] Build the **dashboard** via compose (or prebuilt image with the same LAN `VITE_*` as `.env`).
- [ ] Build Unity **WebGL** museum client and copy into `infra/deploy/lan-party/webgl/` (see lan-party runbook §2.3–2.4).
- [ ] Build and **sideload Quest APKs** on each headset (`VELLUM_BUILD_BACKEND_URL` = LAN API, insecure HTTP allowed for LAN).
- [ ] **Ingest manuscripts** into a demo Space (upload while stack is up); confirm assets in MinIO before you copy volumes or re-upload on the LAN.
- [ ] Dry run on the LAN (or same router at school): `docker compose up -d`, health checks, host **local developer** → create/open Space → **Kiosk on** → mark **Event** → Quest sees event → one laptop joins WebGL.

### Pack list

| Item | Notes |
|------|--------|
| LAN server (laptop or mini PC) | Power cable, Ethernet optional |
| Closed router / Wi‑Fi AP | No WAN on visit day after `.env` is final |
| 2–3 Quest 2 + charged controllers | Spare AA batteries if using disposable cells |
| USB cables / SideQuest-capable laptop | For sideload updates during prep only |
| Host laptop | Dashboard + **Call for help** alerts on Enter tab |
| Optional wall display + HDMI / projector | **Observer / spectator link** so peers (and staff) can watch the same explorer view |
| Reusable or disposable **VR face pads** (foam/silicone covers) | Enough for full rotations, or a wipe-and-swap protocol between users |
| Painter’s tape or floor tape | Play rectangles + “do not cross” lines |
| Sanitizing wipes | Controller grips and **underside of face pads** between users |
| Printed rotation sign / station cards | Quest A/B/C, Laptops, **Peer observation** |
| Extension cord / power strip | Tables rarely have enough outlets |

---

## Room setup (classroom + tables)

**Keep student desks.** Clear **2–3 play rectangles** on the floor instead of moving all furniture.

### Layout

```
  [Teacher / presenter]     [Host laptop + server]

  [Tables — laptops]     [Peer observation — outside tape]

     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
     │  Quest 2    │   │  Quest 2    │   │  Quest 2    │   ← taped rectangles
     │  (standing) │   │  (standing) │   │  (optional) │
     └─────────────┘   └─────────────┘   └─────────────┘
        ↑ peers watch from here (seats/standing spots OUTSIDE tape)

  [Optional wall / projector — observer link for shared view]

  [Clear aisle — no cables across walkways]
```

- **Server + router:** on the presenter table or against a wall; **short Ethernet** to server if possible. Avoid tripping hazards.
- **Quest play areas:** assign one rectangle per active headset. Leave **≥ 1 m (3 ft)** between rectangles so arms-length reach does not overlap.
- **Recommended rectangle sizes (Quest 2, standing, gentle movement only):**
  - **Elementary:** about **1.5 m × 1.5 m** (5 ft × 5 ft) per player — seated variant OK at **1.2 m × 1.2 m** if you disable vigorous movement in briefing.
  - **Middle school:** about **2 m × 2 m** (6.5 ft × 6.5 ft) if space allows; same seated fallback as above.
- **Laptop explorers:** students at tables with browsers; power and Wi‑Fi to the LAN only.
- **Peer observation (primary waiting mode):** students watch classmates in VR, on a **wall or laptop observer link**, or over a peer’s shoulder at laptops — not only an adult-only wall screen. Assign **seats or standing spots outside the tape** beside each Quest rectangle (**2–4 peers** per active headset). Optional: middle school assigns one **narrator** per group to describe what the player notices (quiet voice, no coaching through the tape).
- **Tape rule for peers:** observers **never** enter taped zones or adjust headsets; only adults handle equipment.

### Tape boundaries and guardian

1. Mark each rectangle with **continuous tape** on the floor (corners + mid-edge if helpful).
2. When a student sets up **Guardian / boundary** inside the headset, align it **inside the tape**, not larger than the tape.
3. **Class rule:** “The tape is the wall.” Non-players do **not** step inside tape while someone is in VR.
4. **Spotters** (adults) stand **outside** the tape, on the side away from desks, to catch stumbles without entering the play zone. **Peer observers** stay outside the tape too — they watch and describe; they do **not** spot or enter the play zone.

---

## Day-of bring-up

From the server machine:

```bash
cd infra/deploy/lan-party
# .env already edited with classroom SERVER_LAN_IP
docker compose up -d
curl "http://<SERVER_LAN_IP>:4000/api/health"
curl -I "http://<SERVER_LAN_IP>:5173/"
curl -I "http://<SERVER_LAN_IP>:8080/"
```

### Host checklist (first 10 minutes)

1. Open `DASHBOARD_PUBLIC_URL` on the **host laptop**.
2. **Continue as local developer** (no account sign-in on air-gapped LAN).
3. Open the prepared **Space** → Enter lobby.
4. Enable **Kiosk on**; confirm Space is an **Event** (Quest event list).
5. Confirm manuscript playlist; run a **30-second Quest + one laptop** smoke test.
6. If you have a wall display or projector, open the **observer / spectator link** so peer observers can watch the same view during rotations ([museum-guest-entry.md](museum-guest-entry.md)).
7. Keep host **Enter** tab open — **Call for help** banners appear here ([#294](https://github.com/memphis-iis/Vellum-Rift/issues/294)).
8. Remind staff: **chat is off** on this profile; Quest guests press **left Y** (**Call for help** in ControlsGuide); HUD button is backup. Wrist **ControlsGuide** still works ([#293](https://github.com/memphis-iis/Vellum-Rift/issues/293), [#310](https://github.com/memphis-iis/Vellum-Rift/issues/310)).

### How students join

| Station | Steps |
|---------|--------|
| **Quest** | Launch LAN APK → pick the **exhibit event** → enter Space (see [museum-guest-entry.md](museum-guest-entry.md)). Teach **left Y = Call for help** once per rotation. |
| **Laptop** | Kiosk URL or QR → nametag → **Enter 3D** (WebGL). Optional **observer** URL on wall display or projector for **peer** viewing. |

Share only **LAN URLs** (`http://<SERVER_LAN_IP>:…`). Do not promise internet-only features.

---

## Rotation / classroom management

### Stations (typical class of 20–30)

| Station | Count | Role |
|---------|-------|------|
| **Quest players** | 2–3 | Immersive exploration; one adult spotter each |
| **Laptop explorers** | 4–8 | WebGL at tables; helper circulates |
| **Peer observation** | Everyone else (2–4 per active Quest) | Watch classmates in VR / on observer link / laptop; stay **outside** tape; optional **narrator** (middle school) |

### Time boxes

| Level | Quest turn | Laptop turn | Notes |
|-------|------------|-------------|--------|
| Elementary | **5–8 min** | **8–10 min** | Shorter VR; emphasize calm movement |
| Middle school | **8–12 min** | **10–12 min** | Optional laser/pin if spotter agrees |

Use a **visible timer** (projector or phone) for fairness. Signal **one minute left** verbally.

### Hygiene

- Use **VR face pads** (foam/silicone covers) on the headset interface when available.
- **Swap or wipe** the face pad between every user; **never share the bare face interface** when pads are available.
- Store **used pads separately** (bag or bin); an **adult** handles pad changes — students wait off to the side.
- Wipe **controller grips** and the **underside of face pads** with sanitizing wipes between users.
- Hand sanitizer at exit from Quest station.
- Hair ties / glasses: ask students to adjust **before** headset goes on.

### Adult roles

| Role | Responsibility |
|------|----------------|
| **Presenter** | Welcome, safety, rotation cues — [classroom-museum-presenter-script.md](classroom-museum-presenter-script.md) |
| **Quest spotter(s)** | Tape rules, guardian check, physical safety, mute chaos; **face pad swap** between players |
| **Laptop helper** | Kiosk tab open, nametag help, tab/popup blockers |
| **Host (tech)** | Dashboard Enter tab, Call for help, restart client if stuck |

---

## Tear-down

1. Ask all students to **exit** VR / close WebGL tab.
2. Host: disable kiosk if required by school policy; note Space id for next class.
3. `docker compose down` on server (add `-v` only if you intend to wipe local DB/MinIO).
4. Power down Quests; charge controllers.
5. Collect tape; restore room layout.

---

## Troubleshooting (quick)

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Quest shows **no events** | Kiosk off or Space not **Event** | Host enables kiosk + Event flag ([lan-party-runbook.md](lan-party-runbook.md) §7) |
| Laptop/WebGL **cannot reach API** | Wrong IP in build | Rebuild with LAN `VITE_*` / `VELLUM_BUILD_BACKEND_URL` |
| Student **stuck in VR** | Guardian or menu confusion | Spotter guides; guest presses **left Y** (Call for help); host acknowledges |
| **Call for help** silent | Host not on Enter tab | Open Enter for that session on host laptop |
| Two Quests **collide** | Rectangles too close | Pause rotation; widen tape spacing |
| Upload/manuscript missing | Volume not copied | Re-ingest on LAN or restore MinIO/Postgres volume from prep |
| Compose fails offline | Images not pre-pulled | Prep-day `docker compose pull` / local build |

Full LAN party table: [lan-party-runbook.md](lan-party-runbook.md) §7.

---

## References

- [lan-party-runbook.md](lan-party-runbook.md) — ports, prep, air-gap bring-up, verification
- [museum-guest-entry.md](museum-guest-entry.md) — kiosk QR, guest join, observer display
- [classroom-museum-presenter-script.md](classroom-museum-presenter-script.md) — spoken script for the class
- Deploy: [infra/deploy/lan-party/README.md](../../infra/deploy/lan-party/README.md)
