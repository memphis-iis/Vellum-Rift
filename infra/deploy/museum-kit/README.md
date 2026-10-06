# Deploy: Museum kit (USB + dynamic DHCP IP)

Additive offline kit for a **closed router** when the server IP may change.
Does **not** replace [../lan-party](../lan-party) (fixed `SERVER_LAN_IP` + ports 4000/5173/8080).

Show-day ops: [docs/qa/museum-kit-runbook.md](../../../docs/qa/museum-kit-runbook.md).

## What this adds

- Edge nginx on **:80** (`/` dashboard, `/api`, `/webgl`)
- Relative Vite dashboard build (same-origin)
- Boot script detects LAN IP → `runtime.env` → compose up
- UDP beacon (`lan-discover`) for Quest autodetection
- Optional seed export/import for Event + kiosk + manuscripts
- **Lightweight client USB** ([client-usb/](client-usb/)) — live OS + browser + UDP join (WebGL over Wi‑Fi, no Docker)

## Prep (internet OK)

```bash
cd infra/deploy/museum-kit
cp .env.example .env
# Build WebGL + discovery Quest APK first (see runbook)
./build-kit.sh
./client-usb/pack-client-usb.sh   # laptop / wall-observer sticks
```

### Ventoy USB — server (heavy)

1. Flash [Ventoy](https://www.ventoy.net/); copy a Linux live ISO; create a persistence volume.
2. In the live session (prep, online): install Docker Engine; copy this kit tree to `/opt/vellum-museum-kit`.
3. Autostart: add a desktop/systemd user unit or `~/.config/autostart` entry that runs `/opt/vellum-museum-kit/start-museum-kit.sh` after network-online.
4. Show day: boot offline — script loads `images/*.tar` if needed, detects DHCP IP, brings the stack up.

### Ventoy USB — clients (lightweight)

See [client-usb/README.md](client-usb/README.md). Browser + Wi‑Fi only; exhibit assets stay on the server.

## Show day

```bash
cd /opt/vellum-museum-kit   # or repo path
./start-museum-kit.sh
```

Open the printed `http://<detected-ip>/` on the host and wall observer PC.

## Optional beacon on classic lan-party

```bash
cd infra/deploy/lan-party
docker compose -f docker-compose.yml -f docker-compose.discover.yml up -d
```
