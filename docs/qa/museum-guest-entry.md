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

## Ops checklist

- [ ] Kiosk enabled on the demo Space before doors open
- [ ] QR tested on a phone that is not signed into Bluekey
- [ ] Login page shows Museum / guest panel (not Bluekey-only)
- [ ] Optional: set `VITE_MUSEUM_KIOSK_SPACE_ID` for a one-tap exhibit button

See also: [space-vocabulary.md](space-vocabulary.md), Lobby kiosk controls in the dashboard.
