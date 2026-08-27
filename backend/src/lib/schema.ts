import pool from "./db.js";

const SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS session_notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES game_sessions(session_id),
  type            TEXT NOT NULL,
  recipient_email TEXT NOT NULL DEFAULT '',
  recipient_id    TEXT,
  subject         TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  join_url        TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  delivery_error  TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_notifications_recipient
  ON session_notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_notifications_session
  ON session_notifications (session_id, type, created_at DESC);
`;

/**
 * Ensure all tables exist.
 * Safe to call repeatedly — uses IF NOT EXISTS.
 */
export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA_SQL);
}