# Museum guest entry (no Bluekey) — #180

Walk-up exhibit visitors must **never** be told Bluekey is the only way in.

## Happy paths

### Guests (museum)

1. Host enables **Kiosk on** for the Space (Lobby).
2. Host prints/displays the **kiosk QR** or copies the kiosk link (`?session=<id>&kiosk=1`).
3. Guest opens that URL → nametag → **Enter 3D** (one step joins and opens WebGL). **No IIS account.**
   - If the browser blocks the popup, tap **Open 3D** on the same page (user-gesture popup + auth handoff).
4. Fallbacks on the dashboard login page:
   - **Join museum exhibit** (if `VITE_MUSEUM_KIOSK_SPACE_ID` is built into the dashboard)
   - **Join as guest** with a posted Space ID → same kiosk URL

### Staff / hosts

1. **Sign in with Bluekey** on the login page.
2. Create/open a Space, enable kiosk, share QR with guests.
3. Upload manuscripts and host tools stay on the signed-in path.

## Signage copy (do use)

- “Scan to join — no account needed”
- “Ask staff for the Space QR”

## Signage copy (do not use)

- “Sign in with Bluekey to enter the exhibit”
- “Create an IIS account to continue”

### Museum wall screen (Lobby PC)

1. On the gallery PC (HDMI to the big display), open the Space **Lobby** as host (or any account on a kiosk-enabled Space).
2. Choose **Observer** (Play | Observer toggle) → **Open display** — full-screen WebGL with `spectator=1` (and `unityHud=1` for chat/radar).
   - Or use Host tools → **Copy observer link** and open that URL on the wall PC.
   - Lobby deep link `?observer=1` or `?mode=observer` pre-selects Observer.
3. Automatic camera:
   - Follows guests (cycles ~8s); **laser users take priority**
   - Periodically orbits **pins**, then resumes guests
   - With nobody/nothing interesting, slowly orbits the **manuscript**
4. Overlays: **read-only chat** (lower-right) and **player radar** (lower-left).
5. WASD / right-mouse freecam pauses the director briefly, then it resumes.

Remote guests appear as **cyan cylinder + gold head** pills (not wireframe books). The gallery screen itself does not appear as a remote pill.

## Ops checklist

- [ ] Kiosk enabled on the demo Space before doors open
- [ ] Space marked as **Event** (so Quest `GET /api/kiosk/events` lists it)
- [ ] QR tested on a phone that is not signed into Bluekey
- [ ] Login page shows Museum / guest panel (not Bluekey-only)
- [ ] Optional: set `VITE_MUSEUM_KIOSK_SPACE_ID` for a one-tap exhibit button
- [ ] Quest APK: launch shows public events (or auto-joins when only one is open)
- [ ] Lobby **Play | Observer** → Open display verified on the gallery PC → big screen
- [ ] Observer shows chat history + radar; camera biases to lasers / orbits pins

See also: [space-vocabulary.md](space-vocabulary.md), Lobby kiosk controls in the dashboard.

For an **offline LAN party** (no WAN, chat off, local-dev host): [lan-party-runbook.md](lan-party-runbook.md).
