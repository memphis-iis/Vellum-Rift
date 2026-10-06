#!/usr/bin/env bash
# Export Postgres + MinIO volumes after prep ingest (Event + kiosk + manuscripts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "${ROOT}"
mkdir -p seed
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="seed/museum-kit-${STAMP}"
mkdir -p "${OUT}"

echo "[seed-export] dumping postgres…"
docker compose --env-file .env --env-file runtime.env exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-vellum_rift}" > "${OUT}/postgres.sql"

echo "[seed-export] mirroring minio bucket (best-effort via mc in minio-init network)…"
# Use a one-shot mc container on the compose network
docker compose --env-file .env --env-file runtime.env run --rm --no-deps \
  -v "${ROOT}/${OUT}/minio:/export" \
  minio-init \
  /bin/sh -c "mc alias set local http://minio:9000 \${MINIO_ROOT_USER:-minio} \${MINIO_ROOT_PASSWORD:-minioadmin} && mc mirror local/\${S3_BUCKET_NAME:-vellumrift-lan} /export" \
  || echo "[seed-export] WARN: minio mirror failed — re-upload manuscripts on next prep if needed"

ln -sfn "$(basename "${OUT}")" seed/latest
echo "[seed-export] wrote ${OUT} (seed/latest → $(basename "${OUT}"))"
