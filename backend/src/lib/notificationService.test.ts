import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./db.js", () => ({
  default: { query: vi.fn() },
}));

vi.mock("./gameStateRepository.js", () => ({
  GameStateRepository: class {
    findById = vi.fn();
  },
}));

vi.mock("./jobRepository.js", () => ({
  JobRepository: class {
    getSessionProcessingStatus = vi.fn();
  },
}));

vi.mock("./bluekeyNotificationClient.js", () => ({
  sendBluekeyAppNotification: vi.fn(),
}));

vi.mock("./notificationRepository.js", () => ({
  NotificationRepository: class {
    create = vi.fn();
    markDelivery = vi.fn();
    listInviteEmails = vi.fn();
    countBySessionType = vi.fn();
  },
}));

import { NotificationService } from "./notificationService.js";
import { sendBluekeyAppNotification } from "./bluekeyNotificationClient.js";

describe("NotificationService", () => {
  let service: NotificationService;
  let gameRepo: { findById: ReturnType<typeof vi.fn> };
  let jobRepo: { getSessionProcessingStatus: ReturnType<typeof vi.fn> };
  let noteRepo: {
    create: ReturnType<typeof vi.fn>;
    markDelivery: ReturnType<typeof vi.fn>;
    listInviteEmails: ReturnType<typeof vi.fn>;
    countBySessionType: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationService({ dashboardPublicUrl: "http://localhost:5173" });
    gameRepo = (service as unknown as { gameStateRepo: typeof gameRepo }).gameStateRepo;
    jobRepo = (service as unknown as { jobRepo: typeof jobRepo }).jobRepo;
    noteRepo = (service as unknown as { notificationRepo: typeof noteRepo }).notificationRepo;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildJoinUrl appends session query param", () => {
    expect(service.buildJoinUrl("sess-1")).toBe("http://localhost:5173/?session=sess-1");
  });

  it("sendInvite stores record and marks sent when Bluekey succeeds", async () => {
    gameRepo.findById.mockResolvedValue({
      sessionId: "11111111-1111-1111-1111-111111111111",
      label: "Codex A",
    });
    noteRepo.create.mockResolvedValue({
      notificationId: "n1",
      sessionId: "11111111-1111-1111-1111-111111111111",
      type: "invite",
      recipientEmail: "guest@memphis.edu",
      deliveryStatus: "pending",
    });
    noteRepo.markDelivery.mockResolvedValue(true);
    vi.mocked(sendBluekeyAppNotification).mockResolvedValue({
      ok: true,
      skipped: false,
      status: 200,
    });

    const result = await service.sendInvite({
      sessionId: "11111111-1111-1111-1111-111111111111",
      recipientEmail: "Guest@memphis.edu",
      invitedBy: "host@memphis.edu",
    });

    expect(sendBluekeyAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "vellum_session_invite",
        to: "guest@memphis.edu",
        data: expect.objectContaining({
          joinUrl: "http://localhost:5173/?session=11111111-1111-1111-1111-111111111111",
          sessionLabel: "Codex A",
          invitedBy: "host@memphis.edu",
        }),
      }),
    );
    expect(noteRepo.markDelivery).toHaveBeenCalledWith("n1", "sent");
    expect(result.deliveryStatus).toBe("sent");
  });

  it("sendInvite rejects invalid email", async () => {
    await expect(
      service.sendInvite({
        sessionId: "s1",
        recipientEmail: "not-an-email",
        invitedBy: "host@memphis.edu",
      }),
    ).rejects.toThrow(/valid email/);
  });

  it("handleJobCompletion sends processing_complete when session becomes ready", async () => {
    gameRepo.findById.mockResolvedValue({
      sessionId: "sess-ready",
      label: "Ready room",
      hostId: "acct:1",
      metadata: { hostEmail: "host@memphis.edu" },
    });
    jobRepo.getSessionProcessingStatus.mockResolvedValue({
      isReady: true,
      completedJobs: 1,
    });
    noteRepo.countBySessionType.mockResolvedValue(0);
    noteRepo.listInviteEmails.mockResolvedValue(["guest@memphis.edu"]);
    noteRepo.create.mockImplementation(async (row: { recipientEmail: string }) => ({
      notificationId: `n-${row.recipientEmail}`,
      sessionId: "sess-ready",
      type: "processing_complete",
      recipientEmail: row.recipientEmail,
      deliveryStatus: "pending",
    }));
    noteRepo.markDelivery.mockResolvedValue(true);
    vi.mocked(sendBluekeyAppNotification).mockResolvedValue({ ok: true, skipped: false });

    await service.handleJobCompletion({
      jobId: "job-1",
      sessionId: "sess-ready",
      modelId: "m1",
      status: "completed",
      errorMessage: null,
    });

    expect(sendBluekeyAppNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "vellum_processing_complete",
      }),
    );
    expect(noteRepo.create).toHaveBeenCalled();
  });

  it("handleJobCompletion skips when session already notified", async () => {
    gameRepo.findById.mockResolvedValue({
      sessionId: "sess-ready",
      hostId: "acct:1",
      metadata: {},
    });
    jobRepo.getSessionProcessingStatus.mockResolvedValue({
      isReady: true,
      completedJobs: 2,
    });
    noteRepo.countBySessionType.mockResolvedValue(1);

    await service.handleJobCompletion({
      jobId: "job-2",
      sessionId: "sess-ready",
      modelId: "m2",
      status: "completed",
      errorMessage: null,
    });

    expect(noteRepo.listInviteEmails).not.toHaveBeenCalled();
    expect(sendBluekeyAppNotification).not.toHaveBeenCalled();
  });
});
