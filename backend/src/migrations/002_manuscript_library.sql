-- Private manuscript library: one root per user, folders, shares (#233–#235).

CREATE TABLE IF NOT EXISTS manuscript_libraries (
  library_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_sub    TEXT NOT NULL,
  owner_email  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT manuscript_libraries_owner_sub_chk CHECK (btrim(owner_sub) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_manuscript_libraries_owner_sub
  ON manuscript_libraries (owner_sub);

-- Support ON CONFLICT (owner_sub) in get-or-create
ALTER TABLE manuscript_libraries
  DROP CONSTRAINT IF EXISTS manuscript_libraries_owner_sub_key;
ALTER TABLE manuscript_libraries
  ADD CONSTRAINT manuscript_libraries_owner_sub_key UNIQUE (owner_sub);

CREATE TABLE IF NOT EXISTS library_folders (
  folder_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id   UUID NOT NULL REFERENCES manuscript_libraries(library_id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES library_folders(folder_id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '',
  is_root      BOOLEAN NOT NULL DEFAULT false,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_folders_library
  ON library_folders (library_id, parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_folders_one_root
  ON library_folders (library_id)
  WHERE is_root = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_folders_sibling_name
  ON library_folders (
    library_id,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  WHERE is_root = false;

ALTER TABLE gltf_models
  ADD COLUMN IF NOT EXISTS owner_sub TEXT;

ALTER TABLE gltf_models
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES library_folders(folder_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gltf_models_folder
  ON gltf_models (folder_id);

CREATE INDEX IF NOT EXISTS idx_gltf_models_owner_sub
  ON gltf_models (owner_sub);

CREATE TABLE IF NOT EXISTS library_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id       UUID NOT NULL REFERENCES library_folders(folder_id) ON DELETE CASCADE,
  subject_sub     TEXT,
  email           TEXT,
  role            TEXT NOT NULL DEFAULT 'view',
  added_by_sub    TEXT,
  added_by_email  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT library_shares_identity_chk CHECK (
    (subject_sub IS NOT NULL AND btrim(subject_sub) <> '')
    OR (email IS NOT NULL AND btrim(email) <> '')
  ),
  CONSTRAINT library_shares_role_chk CHECK (role IN ('view', 'edit'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_shares_folder_email
  ON library_shares (folder_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_shares_folder_sub
  ON library_shares (folder_id, subject_sub)
  WHERE subject_sub IS NOT NULL AND btrim(subject_sub) <> '';

CREATE INDEX IF NOT EXISTS idx_library_shares_folder
  ON library_shares (folder_id, created_at DESC);
