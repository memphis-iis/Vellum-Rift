import pool from "./db.js";
import { normalizeEmail } from "./sessionAccess.js";

export interface AllowlistEntry {
  id: string;
  sessionId: string;
  subjectSub: string | null;
  email: string | null;
  addedBySub: string | null;
  addedByEmail: string | null;
  createdAt: string;
}

interface AllowlistRow {
  id: string;
  session_id: string;
  subject_sub: string | null;
  email: string | null;
  added_by_sub: string | null;
  added_by_email: string | null;
  created_at: string;
}

function toRecord(row: AllowlistRow): AllowlistEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    subjectSub: row.subject_sub,
    email: row.email,
    addedBySub: row.added_by_sub,
    addedByEmail: row.added_by_email,
    createdAt: row.created_at,
  };
}

export class SessionAllowlistRepository {
  async list(sessionId: string): Promise<AllowlistEntry[]> {
    const result = await pool.query(
      `SELECT * FROM session_allowlist
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId],
    );
    return (result.rows as AllowlistRow[]).map(toRecord);
  }

  async isAllowlisted(
    sessionId: string,
    user: { sub?: string; email?: string },
  ): Promise<boolean> {
    const email = normalizeEmail(user.email);
    const sub = user.sub?.trim() || "";
    if (!email && !sub) return false;

    const result = await pool.query(
      `SELECT 1 FROM session_allowlist
       WHERE session_id = $1
         AND (
           ($2 <> '' AND subject_sub = $2)
           OR ($3 <> '' AND lower(email) = $3)
         )
       LIMIT 1`,
      [sessionId, sub, email],
    );
    return result.rows.length > 0;
  }

  async add(params: {
    sessionId: string;
    subjectSub?: string | null;
    email?: string | null;
    addedBySub?: string | null;
    addedByEmail?: string | null;
  }): Promise<AllowlistEntry> {
    const email = normalizeEmail(params.email) || null;
    const subjectSub = params.subjectSub?.trim() || null;
    if (!email && !subjectSub) {
      const error = new Error("email or subjectSub is required");
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }

    const existing = await pool.query(
      `SELECT * FROM session_allowlist
       WHERE session_id = $1
         AND (
           ($2::text IS NOT NULL AND subject_sub = $2)
           OR ($3::text IS NOT NULL AND lower(email) = $3)
         )
       LIMIT 1`,
      [params.sessionId, subjectSub, email],
    );
    if (existing.rows.length > 0) {
      return toRecord(existing.rows[0] as AllowlistRow);
    }

    const result = await pool.query(
      `INSERT INTO session_allowlist
         (session_id, subject_sub, email, added_by_sub, added_by_email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        params.sessionId,
        subjectSub,
        email,
        params.addedBySub ?? null,
        params.addedByEmail ? normalizeEmail(params.addedByEmail) : null,
      ],
    );
    return toRecord(result.rows[0] as AllowlistRow);
  }

  async remove(sessionId: string, entryId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM session_allowlist
       WHERE session_id = $1 AND id = $2`,
      [sessionId, entryId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
