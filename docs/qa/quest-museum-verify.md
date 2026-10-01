# Quest Museum Verification (Headset Smoke) — #193, #209, #275, #FTR-005

End-to-end verification for the Meta Quest 2 standalone build. Steps 1–5 are
desk checks; **Step 6 is the sideload / on-headset smoke test**, referenced from
[docs/operations/ci-cd-matrix-deploy.md](../operations/ci-cd-matrix-deploy.md).

Related: [vr-ux-playmode-verify.md](vr-ux-playmode-verify.md) (Editor/PlayMode input
matrix), [museum-guest-entry.md](museum-guest-entry.md) (guest entry without Bluekey).

---

## 1. Static readiness gate (no Unity license)

```bash
pnpm run verify:quest          # ./scripts/verify-quest-readiness.sh
```

- [ ] Result: `ALL 14 CHECKS PASSED`

Covers XR packages, Android player settings (identifier, min SDK 29, ARM64,
Single Pass Instanced), cleartext policy, and the Android OpenXR loader with
Meta Quest Support + Oculus Touch Controller Profile enabled.

## 2. EditMode / PlayMode tests

```bash
vr-client-unity/scripts/run-editmode-tests.sh
vr-client-unity/scripts/run-playmode-tests.sh
```

- [ ] `QuestUxFixTests` passes, including the shader-resolution guards
      (`LineShader_Resolves_…`, `MarkerShader_Resolves_…`) and the label /
      hit-target invariants.

## 3. Project shaders are present (the "yellow square" guards)

The client renders procedural marks, wireframes, and lines through project-owned
shaders under `Assets/Resources/Shaders/`. Legacy built-in names
(`Unlit/Color`, `Standard`, `Particles/Standard Unlit`) are stripped from Quest
builds, and `Shader.Find` then returns `null` — which previously threw inside
`Awake()` and left untextured geometry reading as a bright gold/yellow square in
the visor.

- [ ] `Assets/Resources/Shaders/VellumRiftLine.shader` (`VellumRift/Line`) exists
- [ ] `Assets/Resources/Shaders/AnimatedMarker.shader` (`VellumRift/AnimatedMarker`) exists
- [ ] Both are listed in **Project Settings → Graphics → Always Included Shaders**
- [ ] EditMode test `quest` job passes the `VellumShaders` resolution tests

## 4. Build the APK

```bash
vr-client-unity/scripts/build-android-quest.sh
```

- [ ] `vr-client-unity/Vellum Rift/build/VellumRift-Quest.apk` is produced
- [ ] CI equivalent: **Actions → Unity Android Quest APK → Run workflow**
      (`unity-build-android.yml`, artifact `VellumRift-Quest-apk`)

## 5. Confirm the shaders survived the build

Build stripping is the failure mode this whole checklist exists for.

```bash
cd "vr-client-unity/Vellum Rift"
unzip -o -q build/VellumRift-Quest.apk 'assets/bin/Data/*' -d /tmp/apkcheck
grep -rla 'AnimatedMarker' /tmp/apkcheck | head
strings /tmp/apkcheck/assets/bin/Data/globalgamemanagers | grep 'VellumRift/'
```

- [ ] `VellumRift/Line` and `VellumRift/AnimatedMarker` appear in the build output

## 6. Sideload and smoke test on the headset

```bash
adb install -r "vr-client-unity/Vellum Rift/build/VellumRift-Quest.apk"
adb logcat -c && adb logcat -s Unity ActivityManager OpenXR
```

Then walk the flow below **while watching for untextured geometry**:

- [ ] **No yellow/gold square anywhere in the view**, at any point below
- [ ] Launch → Bluekey/guest lobby is readable (`VellumRift/Line` on-screen text intact)
- [ ] Enter a Space → museum plate + manuscript load; no view-filling slab
- [ ] Full 6DoF head movement with no near-plane crop artifacts
- [ ] Right Touch trigger fires the laser; beam is a **straight phaser line** out the **front of the controller** (gun-forward toward the manuscript — not up the fist, not back at the headset), with a **small cross reticle at the muzzle** and hit dot at impact
- [ ] Login / spaces / pin name / summon dialogs stay **centered in view** (modal follow) with **no sliding stutter**
- [ ] Place a pin (left `A`) → pin renders as a glyph, not a flat parchment square
- [ ] Pin label is ≤ ~1 m wide, floats at a fixed size, and hides within ~0.6 m
- [ ] Place a pin at your own feet → pin/label must **not** cover the visor
- [ ] Chat: laser-select the input → **Quest system keyboard** opens; Done sends; Cancel dismisses
- [ ] Pin name / rename: system keyboard opens; Done confirms label
- [ ] **First XR join:** sticky Menu (Chat + Space Status + How to Play) opens once with coach “Look at your left wrist anytime for Menu.”
- [ ] **Wrist MENU:** raise left wrist + look at the pad labeled **MENU** → HUD sticks open; pad flips to **CLOSE**; look again dismisses
- [ ] Later joins (after teach): FOV starts quiet; wrist opens/closes the same sticky HUD
- [ ] **Jetpack:** left grip thrusts along **look direction** (not world-up); Right A only renames when aiming a pin
- [ ] Chat and How to Play sit on the **right without overlapping** when Menu is open; Session status and Logout similarly separated on the left
- [ ] Chat / controls / status HUDs sit **outside** the central sightline
- [ ] **Left stick moves immediately** from gallery spawn (no “stuck at zero” locomotion)
- [ ] Edge **MANUSCRIPT** / player / waypoint arrows appear on the **visor rim** when the target is off-screen (canvas faces the HMD)
- [ ] Side HUDs stay **peripheral** (roughly under ~1.2 m tall in world space, not wall-sized)
- [ ] Walk away from the manuscript: Space Status shows **distance or “Far from manuscript”**; movement slows but you can **always walk back**; off-screen **MANUSCRIPT** edge pointer still works
- [ ] Console (`adb logcat -s Unity`) shows no `ArgumentNullException` / `Missing shader`
- [ ] Avatar wireframe (self and remote) never draws as a solid gold quad

### Known failure signatures

| Symptom | Cause |
|---------|-------|
| Bright gold/yellow square filling the view | `Shader.Find` returned `null`; geometry drew with the default material |
| `ArgumentNullException: Parameter name: shader` in logcat | A material was built from a null shader inside `Awake()` |
| Magenta/pink model surfaces | glTFast URP keyword variants stripped (`RemoteModelLoader.EnsureQuestReadableMaterials`) |
| HUD text too small / cramped | Panel height mismatch vs `XrHudFollow` expectations (ControlsGuide 200px, Chat 500px, Status 512px vs 560px) |
| HUD content clipped or cut off | Same root cause — panels were shorter than their allocated slot |

### Panel Height Alignment (Quest 2 HUDs)

All side-slot HUDs now declare their internal height and pass the **same** value
to `XrHudFollow.heightPx`, so `SlotOffset()` positions the canvas exactly where
its content sits. Previously each panel was shorter than its slot, leaving dead
space and shrinking text.

| HUD | Internal height | XrHudFollow height | Notes |
|-----|----------------|-------------------|-------|
| Controls Guide (How to Play) | 450px | 450px | Was 200px — only 2 rows fit; now 3-4 rows |
| Chat (Message) | 480px | 480px | Compact side slot |
| Space Status (BackendHealthChecker) | ~329px content | `PANEL_H` (no shadow in slot height) | Shadow stays a child |

Quest 2 side HUD world scale is `0.0024` (`VrTheme.QuestHudWorldScale`) at `2.50 m`
(`HudPanelDistance`), with `HudCenterClearance` 0.62 m and `HudSlotVerticalGap` 0.24 m
so stacked panels stay smaller and clearly separated.

## 7. Exit criteria

- [ ] Steps 1–6 all green
- [ ] Screenshot or short clip captured showing the manuscript view with the HUD,
      for the release notes
