# VR-UX PlayMode Verification Checklist

Editor/PlayMode and on-device checklist for dual-platform Desktop and Meta Quest VR input verification (#184, #192, #197, #231).

## Environment
- [ ] Unity Editor Play Mode (Linux / Desktop keyboard + mouse)
- [ ] Optional: Gamepad attached mid-session
- [ ] Meta Quest 2 Standalone VR (OpenXR + Touch controllers)

---

## 1. Desktop Keyboard & Mouse Mode (`InputControlSchema.Detect() == KeyboardMouse`)
- [ ] **Planar Locomotion:** Pressing `W` / `A` / `S` / `D` moves player camera forward, left, backward, and right.
- [ ] **Elevation:** `Space` moves camera up; `Left Ctrl` or `X` moves camera down.
- [ ] **Turning:** Holding `Right Mouse Button` + mouse delta looks in pitch/yaw; `Z` / `E` turns yaw.
- [ ] **Laser Pointer:** Holding `Left Mouse Button` projects laser ray from camera forward; hit marker appears on manuscript surface.
- [ ] **Controls Guide:** Top-right HUD displays `WASD`, `L-CLK`, `SPACE / CTRL`, `Z / E` badges.

---

## 2. Meta Quest VR Mode (`InputControlSchema.Detect() == XR`)
- [ ] **6DoF Tracking:** HMD position and orientation smoothly drive camera view.
- [ ] **Touch Locomotion:** Left Touch Thumbstick moves player along horizontal plane oriented to HMD yaw.
- [ ] **Touch Turn:** Right Touch Thumbstick provides snap/smooth yaw rotation without tilting pitch.
- [ ] **Jetpack:** Left Hand Grip thrusts along **look direction** (camera forward). Right Hand `A` is pin rename only.
- [ ] **Wrist MENU:** Raise left wrist + look at pad → sticky Chat / Session / How to Play; pad reads **MENU** / **CLOSE**.
- [ ] **Controller Laser:** Laser pointer ray anchors to Right Hand Controller transform rather than head camera.
- [ ] **Trigger Action:** Squeezing Right Index Trigger activates laser beam and selects interactive elements.
- [ ] **Controls Guide:** Displays `L-STICK`, `R-STICK snap`, `L-GRIP (look direction)`, `R-TRIGGER`, `LOOK AT L-WRIST`.

---

## 3. View Integrity & Legibility (`#FTR-005` — Quest 2)

A shader that fails to resolve must **hide** the visual, never draw an untinted
default-material slab. This is the "yellow/gold square across the visor" class of
bug; the guards live in `Assets/Scripts/VellumShaders.cs` +
`Assets/Resources/Shaders/`.

- [ ] **No view-filling geometry:** no gold/yellow square anywhere in the view at any step below.
- [ ] **Laser beam** is a stroked line, not a filled camera-facing quad (right trigger).
- [ ] **Hit dot** is a small cap on the beam end (< 10 cm), never a sphere at the eyes.
- [ ] **Pin glyphs** render via `VellumRift/AnimatedMarker` with soft alpha edges, not a flat parchment square.
- [ ] **Pin labels** are ≤ ~1 m wide, keep a fixed world size (they no longer inherit the billboard quad's per-frame scale), and hide within ~0.6 m.
- [ ] **Self avatar:** the wireframe book hides inside ~0.75 m instead of drawing a gold quad across the gallery.
- [ ] **Camera-parented HUDs:** no canvas is reparented to the Main Camera while XR is active (`HudPanelPlane` returns early).
- [ ] **Chat send button:** hittable with the Touch laser (padded ≥ `VrTheme.MinHitHeightPx` target; input row is 80 px tall).
- [ ] **Side HUDs** stay outside the central sightline (`VrTheme.HudCenterClearance`) at 2.15 m (`VrTheme.HudPanelDistance`).
- [ ] **Body text** stays legible: 16 px ≈ 1.6° at the HUD distance.
- [ ] Console shows no `ArgumentNullException: ... Parameter name: shader` and no `Missing shader` warnings.

Per-device smoke steps: [quest-museum-verify.md](quest-museum-verify.md) (Step 6).
