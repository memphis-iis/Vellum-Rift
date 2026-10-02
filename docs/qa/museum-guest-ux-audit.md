# Museum / elementary guest UX audit (Phase 0)

**Tracking:** [GitHub #314](https://github.com/memphis-iis/Vellum-Rift/issues/314)  
**Audience:** elementary + general museum walk-up guests (Quest, laptop WebGL, facilitator/host).  
**Code snapshot:** `main` @ Phase 0 (includes Quest wrist MENU polish [#312](https://github.com/memphis-iis/Vellum-Rift/pull/312)).  
**Out of scope for this doc:** HUD implementation changes (see Phase 1+ issues below).

## Pass bar (museum day)

| Criterion | Elementary | General museum |
|-----------|------------|----------------|
| Join without IIS account | | |
| See / approach manuscript | | |
| Call for help without staff | | |
| Hide chrome with **one** remembered action | | |

**Overall pass bar:** **Friction** — achievable with facilitator prep and verbal coaching; not yet self-serve for mixed-age groups without staff.

---

## Scoring legend

| Score | Meaning |
|-------|---------|
| **Pass** | Typical guest succeeds without staff intervention |
| **Friction** | Works with signage, one verbal cue, or host setup |
| **Fail** | Blocks exploration, safety, or rotation |

---

## Area scores

### Join

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Friction** | Quest: kiosk event list + **auto-join when exactly one** public event (`BluekeyAuth.MuseumEventsEntryCoroutine`: `events.Count == 1` → `GuestJoinCoroutine`). Multiple events → `MuseumEventPicker` rows. Laptop: kiosk QR / `?kiosk=1` nametag → Enter 3D ([museum-guest-entry.md](museum-guest-entry.md)). |
| General museum | **Pass** | Same paths; auto-join helps single-exhibit days. |

**Code:** `MuseumEventPicker.cs` (world-space modal, `GET /api/kiosk/events`); `BluekeyAuth.cs` guest entry; dashboard `KioskJoin` / login museum panel (`VITE_MUSEUM_KIOSK_SPACE_ID`).

**Ops dependency:** Host must enable **Kiosk on** and mark Space **Event** before doors open.

---

### HUD (peripheral chrome, FOV)

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Friction** | Quest: FOV starts **quiet** — chat, status, guide hidden until wrist teach / MENU (`SessionManager.SetupWristMenuHud`). First join auto-opens sticky stack once (`WristHudGesture.TryFirstTeach`, prefs `vellum.xrMenuTaught`). |
| General museum | **Pass** | Quiet default matches exhibit viewing; teach dismisses automatically after timeout on main (#312). |

**Code:** `XrHudFollow` side slots; `ControlsGuide` hidden on XR at Awake; `BackendHealthChecker.SetHudVisible`.

**Mismatch (historical):** Desktop **H** formerly toggled **How to Play only**. **Fixed in #315:** `SessionHudStack` — H and wrist MENU toggle the same panel set.

---

### Help

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Friction** | Quest: **no on-screen help button** in XR (`SessionManager`: `showHelpHud = !InputControlSchema.IsXrActive()`); primary path is **L-Y** (`HelpRequestBindings.XrInputPath` → `HelpRequestButton.RequestHelpFromInput`). Lower-right HUD remains for desktop/WebGL with Unity HUD. Host sees banners on dashboard Enter ([#294](https://github.com/memphis-iis/Vellum-Rift/issues/294)). |
| General museum | **Friction** | Same; ControlsGuide row documents L-Y but wrist MENU does not surface help. |

**Code:** `HelpRequestButton.cs` (`SetHudVisible` vs component stays enabled for L-Y); `Enter.tsx` help banner + acknowledge.

**Classroom runbook** already requires staff to teach L-Y per rotation.

---

### Chat

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Friction** | **LAN profile: chat off** — `VITE_CHAT_ENABLED=false` in `infra/deploy/lan-party` (dashboard + `?chat=0` on WebGL launch via `webGlLaunchUrl.ts`). Unity respects `ChatEnabled` / `?chat=0`. Quest chat panel still exists inside wrist MENU but LAN ops de-emphasize typing. |
| General museum | **Pass** | Online IIS hosts can leave chat enabled; WebGL embed uses dashboard `SpaceChatPanel` when `CHAT_ENABLED`. |

**Code:** `ChatManager.SetReadOnly` for spectators; `useSessionRoom` skips fetch/send when chat disabled.

---

### Logout / leave

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Friction** | Quest: **logout HUD hidden on XR** (`logoutButton.SetHudVisible(false)`). Rotation = staff removes headset; no in-VR “I’m done.” WebGL/dashboard: leave via embed chrome. |
| General museum | **Friction** | `LogoutButton` revokes Bluekey + reload — appropriate for staff, heavy for kiosk guests. |

---

### Locomotion / laser / pins

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Pass** | XR: stick move, snap turn, grip jetpack along look (`FreeFlyMover`, `PlayerController`); spawn ring outside manuscript (`SessionManager.PlaceLocalPlayerAtSpawn`, bounds adjust). Laser R-trigger; pin L-A; rename/delete aim + R-A/R-B (`InputControlSchema.GuideRows`). Edge arrows for off-screen manuscript (`SpatialIndicatorSystem`). |
| General museum | **Pass** | Same; verify checklist in [quest-museum-verify.md](quest-museum-verify.md). |

**Risk:** Pin rename/delete and jetpack are advanced for youngest guests — facilitator can restrict to look + laser only.

---

### Wrist MENU

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Friction** | Raise left wrist + look at **MENU** pad → sticky MENU stack (How to Play + Space Status + Chat if enabled); **CLOSE** to dismiss (`WristHudGesture` → `SessionHudStack`). Desktop/WebGL Unity HUD: **H** toggles the same stack (#315). Motor + gaze skill varies by age; first-run teach helps. |
| General museum | **Pass** | Documented in quest verify + [vr-ux-playmode-verify.md](vr-ux-playmode-verify.md). |

**Not in sticky stack today:** Help, Logout ([#316](https://github.com/memphis-iis/Vellum-Rift/issues/316), [#317](https://github.com/memphis-iis/Vellum-Rift/issues/317)).

---

### WebGL shell

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Friction** | Default: **HTML shell owns HUD** (`WebGlShellMode.UsesExternalShell` — Unity chat/logout/guide disabled). Dashboard **embed=1** parent owns chat/nav (`WebGlEmbed`). `?unityHud=1` restores legacy Unity HUD for observer/wall modes. |
| General museum | **Pass** | Kiosk one-step join + auth handoff documented in museum-guest-entry. |

**Gap:** One remembered “hide all chrome” across embed vs standalone — [#318](https://github.com/memphis-iis/Vellum-Rift/issues/318).

---

### Host tools

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Pass** | Enter tab: kiosk, event flag, playlist, help ack, moderation hooks (`Enter.tsx`). LAN: local developer host path in classroom runbook. |
| General museum | **Pass** | Bluekey path for staff uploads and allowlist. |

---

### Classroom ops

| Guest type | Score | Notes |
|------------|-------|-------|
| Elementary | **Pass** | [classroom-museum-runbook.md](classroom-museum-runbook.md) covers LAN prep, tape, rotation, hygiene, chat-off + L-Y help, observer link. |
| General museum | **Friction** | Museum wall / kiosk docs strong; elementary-specific rotation timing is classroom doc only. |

---

## Pass bar checklist (honest)

| Criterion | Elementary | General |
|-----------|------------|---------|
| Join | Friction (event picker if >1 event) | Pass |
| Manuscript | Pass (spawn + load when kiosk token OK) | Pass |
| Call for help | Friction (L-Y, staff teach) | Friction |
| One action hide chrome | Friction (wrist MENU Quest; **H** partial on desktop Unity HUD) | Friction |

---

## Code behavior index (brief)

| Behavior | Location |
|----------|----------|
| Auto-join single kiosk event | `BluekeyAuth.cs` |
| Event list UI | `MuseumEventPicker.cs` |
| Wrist sticky HUD | `WristHudGesture.cs`, `SessionManager.SetupWristMenuHud` |
| Desktop H vs XR menu | `ControlsGuide.cs` vs `WristHudGesture.cs` |
| Help L-Y, HUD hidden on Quest | `SessionManager.cs`, `HelpRequestButton.cs`, `PlayerController.cs` |
| Logout hidden on Quest | `SessionManager.cs`, `LogoutButton.cs` |
| LAN chat off | `infra/deploy/lan-party`, `webGlLaunchUrl.ts`, `ChatEnabled.cs` |
| WebGL external shell | `WebGlShellMode.cs` |
| Host help alerts | `web-dashboard/src/screens/Enter.tsx` |

---

## Ranked follow-ups

| Priority | Issue | Rationale |
|----------|-------|-----------|
| **P0 — Phase 1** | [#315](https://github.com/memphis-iis/Vellum-Rift/issues/315) Unify **H** with wrist MENU stack | Single “hide chrome” story for laptops + Quest |
| **P0** | [#316](https://github.com/memphis-iis/Vellum-Rift/issues/316) Help in wrist MENU (not L-Y only) | Pass bar “call for help” without staff |
| **P1** | [#317](https://github.com/memphis-iis/Vellum-Rift/issues/317) Quest guest leave / end session | Clean rotations |
| **P1** | [#318](https://github.com/memphis-iis/Vellum-Rift/issues/318) One-key hide WebGL/dashboard chrome | Laptop kiosk parity with Quest quiet FOV |
| **P2** | Multi-event Quest picker UX | Copy + large touch rows for grades K–5 when auto-join does not apply |
| **P2** | Presenter script ↔ ControlsGuide row parity | Ensure spoken script matches on-screen bindings after Phase 1 |

---

## Related QA

- [museum-guest-entry.md](museum-guest-entry.md)
- [classroom-museum-runbook.md](classroom-museum-runbook.md)
- [quest-museum-verify.md](quest-museum-verify.md)
- [lan-party-runbook.md](lan-party-runbook.md)
