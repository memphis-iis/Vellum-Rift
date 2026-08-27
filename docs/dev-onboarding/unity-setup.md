# Unity Setup

This document captures the current setup expectations for the Unity client workstream.

## Target Roles

- XR engineers building Quest and SteamVR behaviors
- client engineers supporting WebGL delivery
- rendering engineers working on shader and asset pipelines

## Build Targets

- WebGL for hosted web access
- Android-based Quest build
- desktop VR build for Steam distribution

## Core Input Expectations

- Web uses WASD, mouse, and joystick support.
- VR uses joystick locomotion and a jetpack action.
- Drawing support should begin with VR-first authoring.

## Implementation Constraints

1. Shared state models should come from backend-generated contracts rather than manually duplicated network models.
2. Browser-specific behavior for WebGL should be isolated behind plugin boundaries.
3. Asset loading should prefer the same web-friendly formats across Web and VR.
4. Palette and shader controls should remain client-local unless explicitly designed as shared state.

## First Client Workstreams

- flight controller abstraction for Web and VR
- progressive asset loading for partially processed sessions
- local palette switching and shader controls
- radar and session-awareness HUDs
- realtime display of participant movement and in-progress strokes

## Manuscript shaders (glTFast / URP)

Runtime GLB load (`RemoteModelLoader` + `com.unity.cloud.gltfast`) looks correct in the Editor but can pink-out or shade wrong in **WebGL / desktop** players when URP shader graphs or keyword variants are stripped.

### What is already committed

1. **Always Included Shaders** (`ProjectSettings/GraphicsSettings.asset`): glTFast URP Shader Graphs (`glTF-pbrMetallicRoughness`, `glTF-unlit`, `glTF-pbrSpecularGlossiness`, URP clearcoat), plus the Built-In fallbacks already listed.
2. **Preloaded** `Assets/Settings/GltfManuscriptShaderVariants.shadervariants` — common URP + glTFast keyword combos (`_OCCLUSION`, `_EMISSIVE`, `_TEXTURE_TRANSFORM`, shadows/fog).
3. **Resources keep materials** under `Assets/Resources/glTFast/` so builds retain those shaders even if a collection drifts.

### When to re-bake (checklist)

Re-run after changing URP lighting features, adding glTF material extensions, or seeing magenta / wrong materials in a player build:

1. Optional: enable **Strict Shader Variant Matching** (Player → Other Settings) for a validation build so missing variants log clearly instead of silently substituting.
2. Enter Play Mode and load representative manuscripts (textured topography GLBs from `/api/models/...`).
3. **Edit → Project Settings → Graphics → Shader Preloading** → save/merge tracked variants into `GltfManuscriptShaderVariants` (or use menu **Vellum Rift → Shaders → Repopulate glTFast Variant Collection**, then merge tracked variants on top).
4. Confirm the collection is still listed under **Preloaded Shaders**.
5. Rebuild WebGL and desktop; materials should match Editor Play Mode.

### Museum WebGL (quiet gallery)

- Runtime `GalleryEnvironment` builds floor/fog/spawn ring using the **existing** Vellum dark palette (no retheme).
- `HudPanelPlane` stays off (`museumQuietMode`) so HUDs remain screen-space Material 3 chrome.
- Kiosk guests (`?kiosk=1`): no Bluekey popup/paste; leave navigates back to the kiosk join URL.
- Close the Unity Editor, then headless WebGL via `vr-client-unity/scripts/build-webgl-museum.sh` (or `VellumRift.Editor.CIBuild.BuildWebGL`).
- Publish `web build/` to `/assets/static/vellumrift/` on IIS (not the dashboard tree).

See also: [glTFast Project Setup — materials & shader variants](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.19/manual/ProjectSetup.html).