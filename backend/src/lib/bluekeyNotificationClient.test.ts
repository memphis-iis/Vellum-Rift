import { describe, it, expect, vi, beforeEach } from "vitest";

const originalEnv = { ...process.env };

describe("bluekeyNotificationClient", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("skips when API token is missing", async () => {
    process.env.BLUEKEY_SOFTWARE_ID = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    delete process.env.BLUEKEY_API_TOKEN;

    const { sendBluekeyAppNotification } = await import("./bluekeyNotificationClient.js");
    const result = await sendBluekeyAppNotification({
      templateKey: "vellum_session_invite",
      to: "a@b.com",
    });

    expect(result.skipped).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("posts to Bluekey with x-api-token", async () => {
    process.env.BLUEKEY_SOFTWARE_ID = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    process.env.BLUEKEY_API_TOKEN = "secret-token";
    process.env.BLUEKEY_API_BASE_URL = "https://iis.memphis.edu/apis/bluekey";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { sendBluekeyAppNotification } = await import("./bluekeyNotificationClient.js");
    const result = await sendBluekeyAppNotification({
      templateKey: "vellum_session_invite",
      to: "guest@memphis.edu",
      data: { joinUrl: "https://example/?session=1" },
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://iis.memphis.edu/apis/bluekey/api/apps/a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d/notifications/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-token": "secret-token",
        }),
      }),
    );
  });
});
