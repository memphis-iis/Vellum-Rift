# Dashboard IA: Space vocabulary (#181)

User-facing chrome uses **Space** as the one product noun.

| Surface | Say | Avoid |
|---------|-----|--------|
| Nav list | Spaces | Sessions |
| Pre-3D screen | Lobby | Enter, Space room, Session room |
| Go into Unity | Enter 3D | Enter 3D space / 3D room (redundant) |
| Leave Unity | Leave space | Leave session |
| Presence panel | Presence / who’s here | Spatial room / room |
| API / URL / code | `session`, `sessionId`, `?session=` | showing “session” in UI copy |

Canonical definitions: [glossary.md](../reference/glossary.md) (**Space**, **Lobby**, **Session (API)**).

Related audit finding: U-02 in [museum-vr-usability-a11y-cicd-audit.md](museum-vr-usability-a11y-cicd-audit.md).

## Visitor vs host chrome (#183)

- **Visitor (web Lobby):** enter-only — Leave space, Enter 3D, presence, chat. No allowlist, kiosk, playlist, or moderation controls.
- **Host (web Lobby):** same enter chrome plus a labeled **Host tools** panel for ops.
- **VR / Quest (product intent):** enter-only when a VR lobby ships; host ops stay on the web dashboard.

## VR Spaces lobby (#188)

Standalone / Quest / editor without `?session=` opens an IMGUI **Spaces** picker:

- List: `GET /api/game-state`
- Join selected space, then enter the gallery
- Create only via explicit **New space** (`POST` with `visibility` + `kind`)
- Never silently create on boot (missing/archived launch id opens the lobby with a banner)

## VR Bluekey Login lobby (#187)

Standalone / Quest-bound client shows a world-space **Login** panel (dashboard parity):

- **Sign in with Bluekey** — available to anyone with an IIS Bluekey account (not staff-only); opens portal + paste-token fallback; token lands in `ApiAuth` like WebGL handoff
- **Museum / guest** — Space ID → public kiosk mint (no Bluekey); then enter that Space
- WebGL dashboard handoff and `?kiosk=1` guest path unchanged
