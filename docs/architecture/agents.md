# Engineering Agents Definition & Specialization

This document establishes the explicit boundaries, ownership scopes, and integration patterns for developers and automated AI agents contributing to the Vellum Rift polyglot monorepo.

---

## 1. System Agent Definitions

### Agent A: Core Backend & Data Infrastructure (`@agent-core-backend`)
- **Primary Domain Ownership:** `backend/`, `webrtc-sfu/`, `docs/architecture/`
- **Languages/Stack:** Node.js, TypeScript, PostgreSQL (Hasura GraphQL), Express, WebRTC (Pion/LiveKit or raw SFU orchestration).
- **Core Responsibilities:**
  1. Maintain and extend the existing document/page/annotation schemas (`init.sql`, migrations).
  2. Implement the asynchronous image channel extraction and vector trace `.glb` generator service.
  3. Manage real-time state synchronization hooks for room persistence (sessions, participants, spatial pins, strokes).
  4. Build out the WebRTC media pipeline supporting spatial audio attenuation math and global radio override channels.

### Agent B: XR & Unity Interactive Client (`@agent-xr-unity`)
- **Primary Domain Ownership:** `vr-client-unity/`
- **Languages/Stack:** C#, HLSL (Custom Shaders), Unity OpenXR, Unity Input System, WebGL plugins (`.jslib`).
- **Core Responsibilities:**
  1. Develop cross-platform flight mechanics supporting WASD/mouse/gamepad (Web) and Thumbstick + Jetpack button physics (Meta Quest & SteamVR).
  2. Write high-performance vertex shaders to process the Z-value rendering palettes locally per user.
  3. Implement the dynamic asset streaming loader to fetch and process web-friendly `.glb` chunks over HTTP/S3.
  4. Construct the UI layer: 2D minimap radar HUD for WebGL clients, and a curved world-space visor HUD for immersive VR headsets.
  5. Intercept real-time drawing actions to stream 3D line points smoothly over WebRTC data channels before executing batch saves.

### Agent C: Web Dashboard & UX Bridge (`@agent-web-dashboard`)
- **Primary Domain Ownership:** `web-dashboard/`, `design-assets/`
- **Languages/Stack:** JavaScript/TypeScript, React/Next.js, TailwindCSS, WebRTC Web APIs.
- **Core Responsibilities:**
  1. Build user authentication dashboards, EULA acceptance modules, and account settings panels.
  2. Maintain the main web asset upload pipeline, progress bars, and email notification webhooks.
  3. Host the embedded Unity WebGL build instance and engineer clean browser interop communication layers (`window.dispatch` hooks).
  4. Incorporate browser-native WebRTC handlers and integrate the Speech-to-Text / Text-to-Speech translation APIs to drive accessibility.

---
## 2. Operational Rules & Boundaries

### Rule 1: Schema Truth Preservation
All shared definitions regarding users, sessions, pins, and drawing annotation strokes must originate from the PostgreSQL/Hasura configuration files. No C# networking models may be authored manually. 
- *Enforcement:* Changes to API or DB schemas must be introduced via database migrations under `backend/migrations/`. `@agent-xr-unity` must utilize code generation scripts to transform those entities into native C# structs under `vr-client-unity/Assets/Scripts/Networking/Generated/`.

### Rule 2: WebGL Interop Decoupling
To avoid breaking compilation passes between standalone Android packages (Quest APKs) and desktop build targets, all platform-dependent web browser behavior must be fully abstracted.
- *Enforcement:* Direct web browser or DOM actions inside Unity must be isolated within `.jslib` scripts in `vr-client-unity/Assets/Plugins/WebGL/`. These must be wrapped inside native C# preprocessor macros (`#if UNITY_WEBGL && !UNITY_EDITOR`) to prevent compilation failure on standalone PCVR/Quest deployment targets.

### Rule 3: Architectural Documentation Updates (RFC Policy)
Before any agent introduces structural code alterations impacting the real-time syncing pipelines, the respective implementation designs must be codified in Markdown format.
- *Enforcement:* Modifying networking loops, WebRTC payloads, or adding database tables requires an updated system design document (RFC) inside `docs/architecture/` approved via pull request review prior to feature code implementation.