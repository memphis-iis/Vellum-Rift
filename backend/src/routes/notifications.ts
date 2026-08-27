import { Router, type Request, type Response } from "express";
import { NotificationRepository } from "../lib/notificationRepository.js";

const router = Router();
const repo = new NotificationRepository();

const param = (req: Request, name: string): string => String(req.params[name]);

// GET /api/notifications
router.get("/", async (req: Request, res: Response) => {
  try {
    const notifications = await repo.listForUser(
      { sub: req.user?.sub, email: req.user?.email },
      {
        sessionId: typeof req.query.sessionId === "string" ? req.query.sessionId : undefined,
        isRead:
          req.query.isRead === "true"
            ? true
            : req.query.isRead === "false"
              ? false
              : undefined,
        type:
          typeof req.query.type === "string"
            ? (req.query.type as "invite" | "processing_complete" | "processing_failed")
            : undefined,
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 50,
        offset: req.query.offset ? parseInt(String(req.query.offset), 10) : 0,
      },
    );
    res.json(notifications);
  } catch (err) {
    console.error("GET /api/notifications failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  }
});

// PATCH /api/notifications/:notificationId/read
router.patch("/:notificationId/read", async (req: Request, res: Response) => {
  try {
    const notificationId = param(req, "notificationId");
    const existing = await repo.findById(notificationId);
    if (!existing) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    const sub = req.user?.sub;
    const email = req.user?.email?.toLowerCase();
    const owns =
      (sub && existing.recipientId === sub) ||
      (email && existing.recipientEmail.toLowerCase() === email);
    if (!owns) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await repo.markAsRead(notificationId);
    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/notifications/:id/read failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  }
});

export default router;
