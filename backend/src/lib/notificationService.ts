import winston from "winston";
import { GameStateRepository } from "./gameStateRepository.js";
import { JobRepository } from "./jobRepository.js";
import { sendBluekeyAppNotification } from "./bluekeyNotificationClient.js";
import {
  NotificationRepository,
  type SessionNotification,
} from "./notificationRepository.js";
import type { JobCompletionEvent } from "./jobQueue.js";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NotificationServiceConfig {
  /** Public dashboard origin used in invite / ready emails. */
  dashboardPublicUrl?: string;
}

function normalizeEmail(input: string): string {
  return String(input || "").trim().toLowerCase();
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local || email;
}

export class NotificationService {
  private notificationRepo: NotificationRepository;
  private gameStateRepo: GameStateRepository;
  private jobRepo: JobRepository;
  private dashboardPublicUrl: string;

  constructor(config: NotificationServiceConfig = {}) {
    this.notificationRepo = new NotificationRepository();
    this.gameStateRepo = new GameStateRepository();
    this.jobRepo = new JobRepository();
    this.dashboardPublicUrl = (
      config.dashboardPublicUrl ??
      process.env.DASHBOARD_PUBLIC_URL ??
      "http://localhost:5173"
    ).replace(/\/$/, "");
  }

  buildJoinUrl(sessionId: string): string {
    const url = new URL(
      this.dashboardPublicUrl.includes("://")
        ? this.dashboardPublicUrl
        : `https://${this.dashboardPublicUrl}`,
    );
    url.searchParams.set("session", sessionId);
    return url.toString();
  }

  /**
   * Create an invite record and ask Bluekey to email the recipient.
   */
  async sendInvite(params: {
    sessionId: string;
    recipientEmail: string;
    invitedBy: string;
    invitedById?: string | null;
  }): Promise<SessionNotification> {
    const email = normalizeEmail(params.recipientEmail);
    if (!EMAIL_RE.test(email)) {
      const error = new Error("recipientEmail must be a valid email");
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }

    const session = await this.gameStateRepo.findById(params.sessionId);
    if (!session) {
      const error = new Error("Session not found");
      (error as Error & { statusCode?: number }).statusCode = 404;
      throw error;
    }

    const sessionLabel = session.label?.trim() || `Space ${session.sessionId.slice(0, 8)}`;
    const joinUrl = this.buildJoinUrl(session.sessionId);
    const recipientName = displayNameFromEmail(email);
    const invitedBy = params.invitedBy.trim() || "A Vellum Rift host";

    const subject = `You're invited to ${sessionLabel} — Vellum Rift learning space`;
    const body = `${invitedBy} invited you to the learning space “${sessionLabel}”. Join: ${joinUrl}`;

    const record = await this.notificationRepo.create({
      sessionId: session.sessionId,
      type: "invite",
      recipientEmail: email,
      recipientId: null,
      subject,
      body,
      joinUrl,
      metadata: {
        invitedBy,
        invitedById: params.invitedById ?? null,
        sessionLabel,
      },
      deliveryStatus: "pending",
    });

    return this.finishInviteDelivery(record, {
      email,
      recipientName,
      sessionLabel,
      joinUrl,
      invitedBy,
      sessionId: session.sessionId,
    });
  }

  private async finishInviteDelivery(
    record: SessionNotification,
    data: {
      email: string;
      recipientName: string;
      sessionLabel: string;
      joinUrl: string;
      invitedBy: string;
      sessionId: string;
    },
  ): Promise<SessionNotification> {
    const delivery = await sendBluekeyAppNotification({
      templateKey: "vellum_session_invite",
      to: data.email,
      data: {
        recipientName: data.recipientName,
        sessionLabel: data.sessionLabel,
        joinUrl: data.joinUrl,
        invitedBy: data.invitedBy,
      },
      metadata: {
        sessionId: data.sessionId,
        notificationId: record.notificationId,
        kind: "invite",
      },
    });

    if (delivery.skipped) {
      await this.notificationRepo.markDelivery(record.notificationId, "skipped", delivery.error);
      return { ...record, deliveryStatus: "skipped", deliveryError: delivery.error ?? null };
    }
    if (!delivery.ok) {
      await this.notificationRepo.markDelivery(record.notificationId, "failed", delivery.error);
      return { ...record, deliveryStatus: "failed", deliveryError: delivery.error ?? null };
    }

    await this.notificationRepo.markDelivery(record.notificationId, "sent");
    return {
      ...record,
      deliveryStatus: "sent",
      sentAt: new Date().toISOString(),
      deliveryError: null,
    };
  }

  /**
   * Notify prior invitees (and optional host email) that processing finished.
   */
  async sendProcessingComplete(params: {
    sessionId: string;
    hostEmail?: string | null;
    hostId?: string | null;
  }): Promise<SessionNotification[]> {
    const session = await this.gameStateRepo.findById(params.sessionId);
    if (!session) {
      logger.warn(`sendProcessingComplete: session ${params.sessionId} not found`);
      return [];
    }

    const sessionLabel = session.label?.trim() || `Space ${session.sessionId.slice(0, 8)}`;
    const joinUrl = this.buildJoinUrl(session.sessionId);
    const emails = new Set(await this.notificationRepo.listInviteEmails(session.sessionId));
    const hostEmail = params.hostEmail ? normalizeEmail(params.hostEmail) : "";
    if (hostEmail && EMAIL_RE.test(hostEmail)) {
      emails.add(hostEmail);
    }

    const hostId = params.hostId || session.hostId || null;
    const created: SessionNotification[] = [];

    if (emails.size === 0 && hostId) {
      created.push(
        await this.notificationRepo.create({
          sessionId: session.sessionId,
          type: "processing_complete",
          recipientEmail: "",
          recipientId: hostId,
          subject: `${sessionLabel} is ready in Vellum Rift`,
          body: `Manuscript processing for learning space “${sessionLabel}” is complete. Open: ${joinUrl}`,
          joinUrl,
          metadata: { sessionLabel, channel: "in_app" },
          deliveryStatus: "skipped",
          deliveryError: "no recipient email for Bluekey delivery",
        }),
      );
      return created;
    }

    for (const email of emails) {
      const record = await this.notificationRepo.create({
        sessionId: session.sessionId,
        type: "processing_complete",
        recipientEmail: email,
        recipientId: email === hostEmail ? hostId : null,
        subject: `${sessionLabel} is ready in Vellum Rift`,
        body: `Manuscript processing for learning space “${sessionLabel}” is complete. Open: ${joinUrl}`,
        joinUrl,
        metadata: { sessionLabel },
        deliveryStatus: "pending",
      });
      created.push(
        await this.deliverProcessingCompleteEmail(record, {
          email,
          sessionLabel,
          joinUrl,
        }),
      );
    }

    return created;
  }

  private async deliverProcessingCompleteEmail(
    record: SessionNotification,
    params: { email: string; sessionLabel: string; joinUrl: string },
  ): Promise<SessionNotification> {
    const delivery = await sendBluekeyAppNotification({
      templateKey: "vellum_processing_complete",
      to: params.email,
      data: {
        recipientName: displayNameFromEmail(params.email),
        sessionLabel: params.sessionLabel,
        joinUrl: params.joinUrl,
      },
      metadata: {
        sessionId: record.sessionId,
        notificationId: record.notificationId,
        kind: "processing_complete",
      },
    });

    if (delivery.skipped) {
      await this.notificationRepo.markDelivery(record.notificationId, "skipped", delivery.error);
      return { ...record, deliveryStatus: "skipped", deliveryError: delivery.error ?? null };
    }
    if (!delivery.ok) {
      await this.notificationRepo.markDelivery(record.notificationId, "failed", delivery.error);
      return { ...record, deliveryStatus: "failed", deliveryError: delivery.error ?? null };
    }
    await this.notificationRepo.markDelivery(record.notificationId, "sent");
    return {
      ...record,
      deliveryStatus: "sent",
      sentAt: new Date().toISOString(),
      deliveryError: null,
    };
  }

  async handleJobCompletion(event: JobCompletionEvent): Promise<void> {
    const { jobId, sessionId, status, errorMessage } = event;
    if (!sessionId) {
      logger.info(`Job ${jobId} finished with no session — skipping notification`);
      return;
    }

    const session = await this.gameStateRepo.findById(sessionId);
    const hostId = session?.hostId || null;
    const hostEmail =
      typeof session?.metadata?.hostEmail === "string"
        ? session.metadata.hostEmail
        : null;

    if (status === "failed") {
      await this.notificationRepo.create({
        sessionId,
        type: "processing_failed",
        recipientEmail: hostEmail ? normalizeEmail(hostEmail) : "",
        recipientId: hostId,
        subject: `Processing failed for space ${sessionId.slice(0, 8)}`,
        body: errorMessage ?? "Unknown error",
        metadata: { jobId },
        deliveryStatus: "skipped",
        deliveryError: "no Bluekey template for processing_failed",
      });
      return;
    }

    const sessionStatus = await this.jobRepo.getSessionProcessingStatus(sessionId);
    if (!sessionStatus.isReady || sessionStatus.completedJobs === 0) {
      return;
    }

    const prior = await this.notificationRepo.countBySessionType(
      sessionId,
      "processing_complete",
    );
    if (prior > 0) {
      logger.info(`Session ${sessionId} already has processing_complete notices — skip`);
      return;
    }

    await this.sendProcessingComplete({
      sessionId,
      hostEmail,
      hostId,
    });
  }
}
