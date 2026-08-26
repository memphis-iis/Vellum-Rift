-- Vellum Rift — Initial schema
-- Applied by the migration runner (pnpm migrate).
-- This file is idempotent via IF NOT EXISTS; the runner also tracks
-- applied migrations in the _migrations table.

CREATE TABLE IF NOT EXISTS game_sessions (
  session_id UUID PRIMARY KEY,
  label       TEXT NOT NULL DEFAULT '',
  host_id     TEXT NOT NULL DEFAULT '',
  players     JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gltf_models (
  model_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES game_sessions(session_id),
  label        TEXT NOT NULL DEFAULT '',
  storage_key  TEXT NOT NULL,
  height_mode  TEXT NOT NULL,
  width        INT NOT NULL,
  height       INT NOT NULL,
  vertex_count INT NOT NULL DEFAULT 0,
  file_size    BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  job_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      UUID REFERENCES gltf_models(model_id),
  upload_key    TEXT,
  payload       JSONB,
  status        TEXT NOT NULL DEFAULT 'pending',
  progress      INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_manifests (
  asset_id       TEXT PRIMARY KEY,
  version        TEXT NOT NULL DEFAULT '1.0.0',
  source_file    TEXT NOT NULL DEFAULT '',
  total_chunks   INT NOT NULL DEFAULT 1,
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chunks_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  lods_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_tier   TEXT NOT NULL DEFAULT 'balanced'
);

-- SDD 002: Spatial collaboration tables

CREATE TABLE IF NOT EXISTS vr_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      TEXT NOT NULL DEFAULT '',
  current_host_id  TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'active',
  summon_trigger_at TIMESTAMPTZ,
  summon_x         DOUBLE PRECISION NOT NULL DEFAULT 0,
  summon_y         DOUBLE PRECISION NOT NULL DEFAULT 0,
  summon_z         DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vr_session_participants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES vr_sessions(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_x        DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_y        DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_z        DOUBLE PRECISION NOT NULL DEFAULT 0,
  selected_palette TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vr_spatial_artifacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES vr_sessions(id) ON DELETE CASCADE,
  artifact_type    TEXT NOT NULL DEFAULT 'pin',
  label            TEXT NOT NULL DEFAULT '',
  x                DOUBLE PRECISION NOT NULL DEFAULT 0,
  y                DOUBLE PRECISION NOT NULL DEFAULT 0,
  z                DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);