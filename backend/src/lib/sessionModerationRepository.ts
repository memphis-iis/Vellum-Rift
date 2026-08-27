import pool from "./db.js";
import { normalizeEmail } from "./sessionAccess.js";

export type ModerationAction =
  | "kick"
  | "mute"
  | "unmute"
  | "transfer_host";

export interface SessionBan {
  id: string;
  sessionId: string;
  subjectSub: string | null;
  email: string | null;
  playerId: string | null;
  displayName: string | null;
  reason: string | null;
  createdBySub: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

interface BanRow {
  id: string;
  session_id: string;
  subject_sub: string | null;
  email: string | null;
  player_id: string | null;
  display_name: string | null;
  reason: string | null;
  created_by_sub: string | null;
  created_by_email: string | null;
  created_at: string;
}

function toBan(row: BanRow): SessionBan {
  return {
    id: row.id,
    sessionId: row.session_id,
    subjectSub: row.subject_sub,
    email: row.email,
    playerId: row.player_id,
    displayName: row.display_name,
    reason: row.reason,
    createdBySub: row.created_by_sub,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
  };
}

export class SessionModerationRepository {
  async isBanned(
    sessionId: string,
    user: { sub?: string; email?: string },
  ): Promise<boolean> {
    const email = normalizeEmail(user.email);
    const sub = user.sub?.trim() || "";
    if (!email && !sub) return false;

    const result = await pool.query(
      `SELECT 1 FROM session_bans
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

  async addBan(params: {
    sessionId: string;
    subjectSub?: string | null;
    email?: string | null;
    playerId?: string | null;
    displayName?: string | null;
    reason?: string | null;
    createdBySub?: string | null;
    createdByEmail?: string | null;
  }): Promise<SessionBan> {
    const email = normalizeEmail(params.email) || null;
    const subjectSub = params.subjectSub?.trim() || null;
    if (!email && !subjectSub) {
      const error = new Error("ban requires subjectSub or email");
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }

    const existing = await pool.query(
      `SELECT * FROM session_bans
       WHERE session_id = $1
         AND (
           ($2::text IS NOT NULL AND subject_sub = $2)
           OR ($3::text IS NOT NULL AND lower(email) = $3)
         )
       LIMIT 1`,
      [params.sessionId, subjectSub, email],
    );
    if (existing.rows.length > 0) {
      return toBan(existing.rows[0] as BanRow);
    }

    const result = await pool.query(
      `INSERT INTO session_bans
         (session_id, subject_sub, email, player_id, display_name, reason,
          created_by_sub, created_by_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        params.sessionId,
        subjectSub,
        email,
        params.playerId ?? null,
        params.displayName ?? null,
        params.reason ?? null,
        params.createdBySub ?? null,
        params.createdByEmail ? normalizeEmail(params.createdByEmail) : null,
      ],
    );
    return toBan(result.rows[0] as BanRow);
  }

  async recordEvent(params: {
    sessionId: string;
    action: ModerationAction;
    actorSub?: string | null;
    actorEmail?: string | null;
    targetPlayerId?: string | null;
    targetSub?: string | null;
    targetEmail?: string | null;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO session_moderation_events
         (session_id, action, actor_sub, actor_email, target_player_id,
          target_sub, target_email, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        params.sessionId,
        params.action,
        params.actorSub ?? null,
        params.actorEmail ? normalizeEmail(params.actorEmail) : null,
        params.targetPlayerId ?? null,
        params.targetSub ?? null,
        params.targetEmail ? normalizeEmail(params.targetEmail) : null,
        JSON.stringify(params.detail ?? {}),
      ],
    );
  }
}
