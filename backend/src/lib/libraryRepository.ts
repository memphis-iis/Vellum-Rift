/**
 * Manuscript library persistence (#233–#235).
 */

import pool from "./db.js";
import { normalizeEmail } from "./sessionAccess.js";

export type LibraryShareRole = "view" | "edit";

export interface ManuscriptLibrary {
  libraryId: string;
  ownerSub: string;
  ownerEmail: string;
  createdAt: string;
  rootFolderId: string;
  uploadsFolderId: string;
}

export interface LibraryFolder {
  folderId: string;
  libraryId: string;
  parentId: string | null;
  name: string;
  isRoot: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryShare {
  id: string;
  folderId: string;
  subjectSub: string | null;
  email: string | null;
  role: LibraryShareRole;
  addedBySub: string | null;
  addedByEmail: string | null;
  createdAt: string;
}

function mapLibrary(row: Record<string, unknown>): Omit<ManuscriptLibrary, "rootFolderId" | "uploadsFolderId"> {
  return {
    libraryId: String(row.library_id),
    ownerSub: String(row.owner_sub),
    ownerEmail: String(row.owner_email ?? ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapFolder(row: Record<string, unknown>): LibraryFolder {
  return {
    folderId: String(row.folder_id),
    libraryId: String(row.library_id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    name: String(row.name ?? ""),
    isRoot: Boolean(row.is_root),
    isSystem: Boolean(row.is_system),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapShare(row: Record<string, unknown>): LibraryShare {
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    subjectSub: row.subject_sub ? String(row.subject_sub) : null,
    email: row.email ? String(row.email) : null,
    role: row.role === "edit" ? "edit" : "view",
    addedBySub: row.added_by_sub ? String(row.added_by_sub) : null,
    addedByEmail: row.added_by_email ? String(row.added_by_email) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export class LibraryRepository {
  async findLibraryByOwner(ownerSub: string): Promise<ManuscriptLibrary | null> {
    const { rows } = await pool.query(
      `SELECT * FROM manuscript_libraries WHERE owner_sub = $1`,
      [ownerSub],
    );
    if (!rows[0]) return null;
    const lib = mapLibrary(rows[0] as Record<string, unknown>);
    const root = await this.findRootFolder(lib.libraryId);
    const uploads = await this.findUploadsFolder(lib.libraryId);
    if (!root || !uploads) return null;
    return {
      ...lib,
      rootFolderId: root.folderId,
      uploadsFolderId: uploads.folderId,
    };
  }

  async getOrCreateLibrary(ownerSub: string, ownerEmail: string): Promise<ManuscriptLibrary> {
    const existing = await this.findLibraryByOwner(ownerSub);
    if (existing) return existing;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const libRes = await client.query(
        `INSERT INTO manuscript_libraries (owner_sub, owner_email)
         VALUES ($1, $2)
         ON CONFLICT (owner_sub) DO UPDATE SET owner_email = COALESCE(NULLIF(EXCLUDED.owner_email, ''), manuscript_libraries.owner_email)
         RETURNING *`,
        [ownerSub, ownerEmail ?? ""],
      );
      const libRow = libRes.rows[0] as Record<string, unknown>;
      const libraryId = String(libRow.library_id);

      let rootRes = await client.query(
        `SELECT * FROM library_folders WHERE library_id = $1 AND is_root = true`,
        [libraryId],
      );
      if (!rootRes.rows[0]) {
        rootRes = await client.query(
          `INSERT INTO library_folders (library_id, parent_id, name, is_root, is_system)
           VALUES ($1, NULL, '', true, true)
           RETURNING *`,
          [libraryId],
        );
      }
      const rootId = String(rootRes.rows[0].folder_id);

      let uploadsRes = await client.query(
        `SELECT * FROM library_folders
         WHERE library_id = $1 AND is_system = true AND is_root = false AND lower(name) = 'uploads'`,
        [libraryId],
      );
      if (!uploadsRes.rows[0]) {
        uploadsRes = await client.query(
          `INSERT INTO library_folders (library_id, parent_id, name, is_root, is_system)
           VALUES ($1, $2, 'Uploads', false, true)
           RETURNING *`,
          [libraryId, rootId],
        );
      }

      await client.query("COMMIT");
      return {
        ...mapLibrary(libRow),
        rootFolderId: rootId,
        uploadsFolderId: String(uploadsRes.rows[0].folder_id),
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findFolderById(folderId: string): Promise<LibraryFolder | null> {
    const { rows } = await pool.query(
      `SELECT * FROM library_folders WHERE folder_id = $1`,
      [folderId],
    );
    if (!rows[0]) return null;
    return mapFolder(rows[0] as Record<string, unknown>);
  }

  async findRootFolder(libraryId: string): Promise<LibraryFolder | null> {
    const { rows } = await pool.query(
      `SELECT * FROM library_folders WHERE library_id = $1 AND is_root = true`,
      [libraryId],
    );
    if (!rows[0]) return null;
    return mapFolder(rows[0] as Record<string, unknown>);
  }

  async findUploadsFolder(libraryId: string): Promise<LibraryFolder | null> {
    const { rows } = await pool.query(
      `SELECT * FROM library_folders
       WHERE library_id = $1 AND is_system = true AND is_root = false AND lower(name) = 'uploads'`,
      [libraryId],
    );
    if (!rows[0]) return null;
    return mapFolder(rows[0] as Record<string, unknown>);
  }

  async findLibraryById(libraryId: string): Promise<Omit<ManuscriptLibrary, "rootFolderId" | "uploadsFolderId"> | null> {
    const { rows } = await pool.query(
      `SELECT * FROM manuscript_libraries WHERE library_id = $1`,
      [libraryId],
    );
    if (!rows[0]) return null;
    return mapLibrary(rows[0] as Record<string, unknown>);
  }

  async listChildFolders(parentId: string): Promise<LibraryFolder[]> {
    const { rows } = await pool.query(
      `SELECT * FROM library_folders
       WHERE parent_id = $1 AND is_root = false
       ORDER BY lower(name) ASC`,
      [parentId],
    );
    return rows.map((r) => mapFolder(r as Record<string, unknown>));
  }

  async createFolder(params: {
    libraryId: string;
    parentId: string;
    name: string;
  }): Promise<LibraryFolder> {
    const name = params.name.trim();
    if (!name) throw new Error("Folder name is required");
    const { rows } = await pool.query(
      `INSERT INTO library_folders (library_id, parent_id, name, is_root, is_system)
       VALUES ($1, $2, $3, false, false)
       RETURNING *`,
      [params.libraryId, params.parentId, name],
    );
    return mapFolder(rows[0] as Record<string, unknown>);
  }

  async renameFolder(folderId: string, name: string): Promise<LibraryFolder | null> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Folder name is required");
    const { rows } = await pool.query(
      `UPDATE library_folders
       SET name = $2, updated_at = NOW()
       WHERE folder_id = $1 AND is_root = false
       RETURNING *`,
      [folderId, trimmed],
    );
    if (!rows[0]) return null;
    return mapFolder(rows[0] as Record<string, unknown>);
  }

  async countChildren(folderId: string): Promise<{ folders: number; models: number }> {
    const folders = await pool.query(
      `SELECT COUNT(*)::int AS n FROM library_folders WHERE parent_id = $1`,
      [folderId],
    );
    const models = await pool.query(
      `SELECT COUNT(*)::int AS n FROM gltf_models WHERE folder_id = $1`,
      [folderId],
    );
    return {
      folders: Number(folders.rows[0]?.n ?? 0),
      models: Number(models.rows[0]?.n ?? 0),
    };
  }

  async deleteFolderIfEmpty(folderId: string): Promise<boolean> {
    const folder = await this.findFolderById(folderId);
    if (!folder || folder.isRoot || folder.isSystem) return false;
    const counts = await this.countChildren(folderId);
    if (counts.folders > 0 || counts.models > 0) return false;
    const res = await pool.query(
      `DELETE FROM library_folders WHERE folder_id = $1`,
      [folderId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listAncestors(folderId: string): Promise<LibraryFolder[]> {
    const chain: LibraryFolder[] = [];
    let current = await this.findFolderById(folderId);
    while (current) {
      chain.unshift(current);
      if (!current.parentId) break;
      current = await this.findFolderById(current.parentId);
    }
    return chain;
  }

  async listShares(folderId: string): Promise<LibraryShare[]> {
    const { rows } = await pool.query(
      `SELECT * FROM library_shares WHERE folder_id = $1 ORDER BY created_at DESC`,
      [folderId],
    );
    return rows.map((r) => mapShare(r as Record<string, unknown>));
  }

  async addShare(params: {
    folderId: string;
    subjectSub?: string | null;
    email?: string | null;
    role: LibraryShareRole;
    addedBySub?: string | null;
    addedByEmail?: string | null;
  }): Promise<LibraryShare> {
    const email = params.email ? normalizeEmail(params.email) : null;
    const sub = params.subjectSub?.trim() || null;
    if (!email && !sub) throw new Error("email or subjectSub required");
    const { rows } = await pool.query(
      `INSERT INTO library_shares
         (folder_id, subject_sub, email, role, added_by_sub, added_by_email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        params.folderId,
        sub,
        email,
        params.role,
        params.addedBySub ?? null,
        params.addedByEmail ?? null,
      ],
    );
    return mapShare(rows[0] as Record<string, unknown>);
  }

  async deleteShare(folderId: string, shareId: string): Promise<boolean> {
    const res = await pool.query(
      `DELETE FROM library_shares WHERE id = $1 AND folder_id = $2`,
      [shareId, folderId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Shares that apply to this folder via the folder itself or any ancestor.
   */
  async listApplicableShares(
    folderId: string,
    user: { sub?: string; email?: string },
  ): Promise<LibraryShare[]> {
    const ancestors = await this.listAncestors(folderId);
    const ids = ancestors.map((f) => f.folderId);
    if (ids.length === 0) return [];
    const email = normalizeEmail(user.email);
    const { rows } = await pool.query(
      `SELECT * FROM library_shares
       WHERE folder_id = ANY($1::uuid[])
         AND (
           ($2::text <> '' AND subject_sub = $2)
           OR ($3::text <> '' AND lower(email) = $3)
         )`,
      [ids, user.sub?.trim() ?? "", email],
    );
    return rows.map((r) => mapShare(r as Record<string, unknown>));
  }

  /** True if any folder in this library has at least one share. */
  async libraryHasShares(libraryId: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT 1
       FROM library_shares ls
       JOIN library_folders lf ON lf.folder_id = ls.folder_id
       WHERE lf.library_id = $1
       LIMIT 1`,
      [libraryId],
    );
    return rows.length > 0;
  }

  /** Folders shared with this user (not owned by them). */
  async listFoldersSharedWith(
    user: { sub?: string; email?: string },
  ): Promise<Array<LibraryFolder & { role: LibraryShareRole; ownerEmail: string }>> {
    const email = normalizeEmail(user.email);
    const sub = user.sub?.trim() ?? "";
    if (!sub && !email) return [];
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (lf.folder_id)
         lf.*,
         ls.role,
         ml.owner_email,
         ml.owner_sub
       FROM library_shares ls
       JOIN library_folders lf ON lf.folder_id = ls.folder_id
       JOIN manuscript_libraries ml ON ml.library_id = lf.library_id
       WHERE (
           ($1::text <> '' AND ls.subject_sub = $1)
           OR ($2::text <> '' AND lower(ls.email) = $2)
         )
         AND ml.owner_sub IS DISTINCT FROM $1
       ORDER BY lf.folder_id, CASE WHEN ls.role = 'edit' THEN 0 ELSE 1 END`,
      [sub, email],
    );
    return rows.map((r) => ({
      ...mapFolder(r as Record<string, unknown>),
      role: (r as { role?: string }).role === "edit" ? ("edit" as const) : ("view" as const),
      ownerEmail: String((r as { owner_email?: string }).owner_email ?? ""),
    }));
  }
}
