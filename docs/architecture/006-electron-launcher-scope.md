# ADR / RFC: Electron launcher for desktop SSO (deferred)

Status: **Accepted — do not build Electron for MVP**  
Related: #129 (auth handoff), #128 (desktop CLI session join), #127 (Enter launcher)

## Decision

Near-term desktop auth and session join use **CLI / env** only:

- `-session=` / `VELLUM_SESSION_ID`
- `-playerName=` / `VELLUM_PLAYER_NAME`
- `-isHost=` / `VELLUM_IS_HOST`
- `-accessToken=` / `VELLUM_ACCESS_TOKEN` (optional; treat like a password)
- `-backendUrl=` / `VELLUM_BACKEND_URL`

Web auth handoff uses **postMessage** from the dashboard into Unity WebGL (never `?accessToken=` in the URL).

An **Electron shell** that hosts Bluekey and spawns the Unity binary is **out of scope** until desktop SSO UX is still painful after CLI + optional custom protocol.

## Why Electron was considered

- Familiar Chromium Bluekey popup
- Spawn Unity with session + token via env / IPC
- Custom protocol (`vellumrift://`) from the dashboard

## Costs

- Packaging, code signing, auto-update
- Token storage and IPC security review
- Does not replace a signed Unity build

## Go / no-go

| Path | Verdict |
|------|---------|
| WebGL + dashboard postMessage handoff | **Go (implemented)** |
| Desktop CLI/env (`-session=`, `-accessToken=`) | **Go (implemented)** |
| Custom URL protocol only | Later, if installers need deep links |
| Electron launcher | **No-go for MVP**; revisit only if CLI handoff fails product needs |

## Revisit triggers

- Users cannot reliably launch desktop with token without a second login
- IT requires a managed desktop wrapper
- Custom protocol + signed installer still insufficient

## Non-goals

- Replacing Unity with a browser-only client
- Long-lived tokens in shareable URLs
- GlyphWitch ACL / team permissions
