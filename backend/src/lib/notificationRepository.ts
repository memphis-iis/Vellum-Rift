import pool from "./db.js";

export type SessionNotificationType =
  | "invite"
  | "processing_complete"
  | "processing_failed";

export type DeliveryStatus = "pending" | "sent" | "skipped" | "failed";

export interface SessionNotification {
  notificationId: string;
  sessionId: string | null;
  type: SessionNotificationType;
  recipientEmail: string;
  recipientId: string | null;
  subject: string;
  body: string;
  joinUrl: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  deliveryStatus: DeliveryStatus;
  deliveryError: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  notification_id: string;
  session_id: string | null;
  type: string;
  recipient_email: string;
  recipient_id: string | null;
  subject: string;
  body: string;
  join_url: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  delivery_status: string;
  delivery_error: string | null;
  sent_at: string | null;
  created_at: string;
}

function toRecord(row: NotificationRow): SessionNotification {
  return {
    notificationId: row.notification_id,
    sessionId: row.session_id,
    type: row.type as SessionNotificationType,
    recipientEmail: row.recipient_email,
    recipientId: row.recipient_id,
    subject: row.subject,
    body: row.body,
    joinUrl: row.join_url,
    metadata: row.metadata ?? {},
    isRead: row.is_read,
    deliveryStatus: row.delivery_status as DeliveryStatus,
    deliveryError: row.delivery_error,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

export class NotificationRepository {
  async create(params: {
    sessionId?: string | null;
    type: SessionNotificationType;
    recipientEmail: string;
    recipientId?: string | null;
    subject?: string;
    body?: string;
    joinUrl?: string | null;
    metadata?: Record<string, unknown>;
    deliveryStatus?: DeliveryStatus;
    deliveryError?: string | null;
    sentAt?: string | null;
  }): Promise<SessionNotification> {
    const result = await pool.query(
      `INSERT INTO session_notifications
         (session_id, type, recipient_email, recipient_id, subject, body, join_url,
          metadata, delivery_status, delivery_error, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
       RETURNING *`,
      [
        params.sessionId ?? null,
        params.type,
        params.recipientEmail,
        params.recipientId ?? null,
        params.subject ?? "",
        params.body ?? "",
        params.joinUrl ?? null,
        JSON.stringify(params.metadata ?? {}),
        params.deliveryStatus ?? "pending",
        params.deliveryError ?? null,
        params.sentAt ?? null,
      ],
    );
    return toRecord(result.rows[0] as NotificationRow);
  }

  async markDelivery(
    notificationId: string,
    deliveryStatus: DeliveryStatus,
    deliveryError?: string | null,
  ): Promise<boolean> {
    const sentAt = deliveryStatus === "sent" ? new Date().toISOString() : null;
    const result = await pool.query(
      `UPDATE session_notifications
       SET delivery_status = $2,
           delivery_error = $3,
           sent_at = COALESCE($4::timestamptz, sent_at)
       WHERE notification_id = $1`,
      [notificationId, deliveryStatus, deliveryError ?? null, sentAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findById(notificationId: string): Promise<SessionNotification | null> {
    const result = await pool.query(
      `SELECT * FROM session_notifications WHERE notification_id = $1`,
      [notificationId],
    );
    if (result.rows.length === 0) return null;
    return toRecord(result.rows[0] as NotificationRow);
  }

  async markAsRead(notificationId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE session_notifications SET is_read = true WHERE notification_id = $1`,
      [notificationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listForUser(
    user: { sub?: string; email?: string },
    params?: {
      sessionId?: string;
      isRead?: boolean;
      type?: SessionNotificationType;
      limit?: number;
      offset?: number;
    },
  ): Promise<SessionNotification[]> {
    const where: string[] = [];
    const values: (string | boolean | number)[] = [];
    let idx = 1;

    const identity: string[] = [];
    if (user.sub) {
      identity.push(`recipient_id = $${idx++}`);
      values.push(user.sub);
    }
    if (user.email) {
      identity.push(`lower(recipient_email) = lower($${idx++})`);
      values.push(user.email);
    }
    if (identity.length === 0) {
      return [];
    }
    where.push(`(${identity.join(" OR ")})`);

    if (params?.sessionId) {
      where.push(`session_id = $${idx++}`);
      values.push(params.sessionId);
    }
    if (params?.isRead !== undefined) {
      where.push(`is_read = $${idx++}`);
      values.push(params.isRead);
    }
    if (params?.type) {
      where.push(`type = $${idx++}`);
      values.push(params.type);
    }

    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;

    const result = await pool.query(
      `SELECT * FROM session_notifications
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    );
    return (result.rows as NotificationRow[]).map(toRecord);
  }

  /** Distinct invitee emails previously invited to a session. */
  async listInviteEmails(sessionId: string): Promise<string[]> {
    const result = await pool.query(
      `SELECT DISTINCT lower(recipient_email) AS email
       FROM session_notifications
       WHERE session_id = $1
         AND type = 'invite'
         AND recipient_email <> ''
       ORDER BY email`,
      [sessionId],
    );
    return (result.rows as { email: string }[]).map((r) => r.email);
  }

  async countBySessionType(
    sessionId: string,
    type: SessionNotificationType,
  ): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM session_notifications
       WHERE session_id = $1 AND type = $2`,
      [sessionId, type],
    );
    return (result.rows[0] as { count: number }).count;
  }
}
