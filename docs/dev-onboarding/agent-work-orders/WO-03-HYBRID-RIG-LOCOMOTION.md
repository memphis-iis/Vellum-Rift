# Work Order 03: Hybrid Rig, Locomotion & Laser Pointer

- **Target Issues:**
  - [#192: [Q-02] Quest: Touch locomotion (thumbstick + jetpack) replacing WASD-only](https://github.com/memphis-iis/Vellum-Rift/issues/192)
  - [#197: [Q-07] Quest: wire laser to Touch controller (replace camera-forward fallback)](https://github.com/memphis-iis/Vellum-Rift/issues/197)
  - [#184: [U-05] Controls primer: platform-specific hints (Touch vs WASD)](https://github.com/memphis-iis/Vellum-Rift/issues/184)
- **Parent Issues:** [#270](https://github.com/memphis-iis/Vellum-Rift/issues/270), [#178](https://github.com/memphis-iis/Vellum-Rift/issues/178)
- **Estimated Effort:** 1.5 hours

---

## 1. Objective
Transform player movement and interaction scripts to support a **Hybrid Rig**. When XR is active (Quest standalone or PCVR), the camera and interactions are driven by Touch controllers (thumbstick locomotion relative to HMD yaw, jetpack lift, controller-anchored laser). When running on desktop without VR, the existing WASD, mouse-look, and keyboard controls continue to function seamlessly without regressions.

---

## 2. Technical Architecture: Hybrid Rig Pattern

```
Player (GameObject with PlayerController, FreeFlyMover)
  └── XR Origin (XR Origin / Rig component)
       └── Camera Offset
            ├── Main Camera (Camera, Universal Additional Camera Data)
            ├── Left Controller (TrackedPoseDriver - Left Hand, XRController)
            └── Right Controller (TrackedPoseDriver - Right Hand, XRController, LaserPointer)
```

### Dynamic Runtime Behavior
1. **On Desktop / WebGL (`!InputControlSchema.IsXrActive()`):**
   - `FreeFlyMover` reads Keyboard WASD + Mouse Delta to translate and rotate `Main Camera`.
   - `LaserPointer` projects forward from `Main Camera` center or screen cursor.
   - `ControlsGuide` displays `WASD`, `L-CLK`, `SPACE / CTRL`, and `Q / E`.
2. **On Quest / XR (`InputControlSchema.IsXrActive()`):**
   - HMD drives `Main Camera` position and orientation.
   - Left Touch Thumbstick feeds horizontal translation vector relative to HMD yaw into `PlayerController`.
   - Right Touch Thumbstick provides snap/smooth yaw rotation.
   - Primary / Grip button provides jetpack vertical lift.
   - `LaserPointer` dynamically locates and anchors to `Right Controller` transform and fires via XR trigger action.
   - `ControlsGuide` displays Touch badges (`L-STICK`, `R-STICK`, `GRIP / A`, `R-TRIGGER`).

---

## 3. Implementation Summary
- `Assets/Scripts/VellumRift.asmdef`: Added `Unity.XR.Interaction.Toolkit` and `Unity.XR.CoreUtils` assembly references.
- `Assets/Scripts/InputControlSchema.cs`: Added schema detection (`ControlSchema.XR`, `Gamepad`, `KeyboardMouse`) and platform-specific `GuideRows`.
- `Assets/Scripts/PlayerController.cs`: Added composite bindings for XR thumbsticks, jetpack elevation, and trigger. Updated `FreeFlyMover.Tick` to project movement relative to HMD yaw in XR.
- `Assets/Scripts/LaserPointer.cs`: Replaced legacy `Input.GetAxis("XRI_Right_Trigger")` with modern `InputAction` `<XRController>{RightHand}/triggerPressed`. Added dynamic anchor search to bind beam origin to the right controller in VR.
- `Assets/Scripts/ControlsGuide.cs`: Dynamically updates control HUD badges based on detected input schema.
- `docs/qa/vr-ux-playmode-verify.md`: QA verification checklist for Desktop and Quest VR modes.
