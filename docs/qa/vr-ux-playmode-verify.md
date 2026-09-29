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
- [ ] **Turning:** Holding `Right Mouse Button` + mouse delta looks in pitch/yaw; `Q` / `E` turns yaw.
- [ ] **Laser Pointer:** Holding `Left Mouse Button` projects laser ray from camera forward; hit marker appears on manuscript surface.
- [ ] **Controls Guide:** Top-right HUD displays `WASD`, `L-CLK`, `SPACE / CTRL`, `Q / E` badges.

---

## 2. Meta Quest VR Mode (`InputControlSchema.Detect() == XR`)
- [ ] **6DoF Tracking:** HMD position and orientation smoothly drive camera view.
- [ ] **Touch Locomotion:** Left Touch Thumbstick moves player along horizontal plane oriented to HMD yaw.
- [ ] **Touch Turn:** Right Touch Thumbstick provides snap/smooth yaw rotation without tilting pitch.
- [ ] **Jetpack:** Right Hand primary button (`A`) or Left Hand Grip lifts player vertically.
- [ ] **Controller Laser:** Laser pointer ray anchors to Right Hand Controller transform rather than head camera.
- [ ] **Trigger Action:** Squeezing Right Index Trigger activates laser beam and selects interactive elements.
- [ ] **Controls Guide:** Displays `L-STICK (Move)`, `R-STICK (Turn)`, `GRIP / A (Jetpack)`, `R-TRIGGER (Laser)`.
