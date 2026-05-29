#!/usr/bin/env bash
set -euo pipefail

cp -n .env.example .env || true
cp -n backend/.env.example backend/.env || true
cp -n webrtc-sfu/.env.example webrtc-sfu/.env || true

docker compose --env-file .env -f docker-compose.yml up -d
docker compose --env-file .env -f docker-compose.yml -f docker-compose.tools.yml up -d

cat <<'EOF'
Local infrastructure is starting.

Next steps:
1. Review .env, backend/.env, and webrtc-sfu/.env.
2. Apply migrations when the backend migration tooling exists.
3. Start the backend and SFU development servers.
4. Optionally start the speech stack with: docker compose --env-file .env -f docker-compose.yml -f docker-compose.speech.yml up -d

Useful URLs:
- Hasura: http://localhost:8080
- MinIO console: http://localhost:9001
- Mailpit: http://localhost:8025
- Adminer: http://localhost:8081
- Unity project: vr-client-unity/Vellum Rift
EOF
