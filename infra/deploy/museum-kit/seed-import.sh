#!/usr/bin/env bash
# Import seed/latest into a running museum-kit stack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "${ROOT}"
SRC="${1:-seed/latest}"
if [[ ! -d "${SRC}" ]]; then
  echo "[seed-import] missing ${SRC}"
  exit 1
fi

if [[ -f "${SRC}/postgres.sql" ]]; then
  echo "[seed-import] restoring postgres…"
  docker compose --env-file .env --env-file runtime.env exec -T postgres \
    psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-vellum_rift}" < "${SRC}/postgres.sql"
fi

if [[ -d "${SRC}/minio" ]]; then
  echo "[seed-import] mirroring minio…"
  docker compose --env-file .env --env-file runtime.env run --rm --no-deps \
    -v "${ROOT}/${SRC}/minio:/import:ro" \
    minio-init \
    /bin/sh -c "mc alias set local http://minio:9000 \${MINIO_ROOT_USER:-minio} \${MINIO_ROOT_PASSWORD:-minioadmin} && mc mb --ignore-existing local/\${S3_BUCKET_NAME:-vellumrift-lan} && mc mirror /import local/\${S3_BUCKET_NAME:-vellumrift-lan}" \
    || echo "[seed-import] WARN: minio restore failed"
fi

echo "[seed-import] done"
