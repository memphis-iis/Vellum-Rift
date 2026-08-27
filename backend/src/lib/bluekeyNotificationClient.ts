/**
 * Thin client for Bluekey app notification send (memphis-iis/bluekey#5).
 * Vellum does not own SMTP — Bluekey renders templates and delivers mail.
 */

export interface BluekeySendParams {
  templateKey: string;
  to: string;
  data?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface BluekeySendResult {
  ok: boolean;
  skipped: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

export function getBluekeyNotificationConfig() {
  return {
    apiBase: (process.env.BLUEKEY_API_BASE_URL ?? "https://iis.memphis.edu/apis/bluekey").replace(
      /\/$/,
      "",
    ),
    softwareId: process.env.BLUEKEY_SOFTWARE_ID ?? "",
    apiToken: process.env.BLUEKEY_API_TOKEN ?? "",
  };
}

/**
 * POST /api/apps/:softwareId/notifications/send
 * Skips cleanly when software id or API token is unset (local/dev).
 */
export async function sendBluekeyAppNotification(
  params: BluekeySendParams,
): Promise<BluekeySendResult> {
  const { apiBase, softwareId, apiToken } = getBluekeyNotificationConfig();

  if (!softwareId || !apiToken) {
    return {
      ok: true,
      skipped: true,
      error: "BLUEKEY_SOFTWARE_ID or BLUEKEY_API_TOKEN not configured",
    };
  }

  const url = `${apiBase}/api/apps/${encodeURIComponent(softwareId)}/notifications/send`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": apiToken,
        "x-requesting-app": "vellum-rift",
      },
      body: JSON.stringify({
        templateKey: params.templateKey,
        to: params.to,
        data: params.data ?? {},
        metadata: params.metadata ?? {},
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        status: response.status,
        body,
        error:
          (body as { error?: string } | null)?.error ??
          `Bluekey notification failed (${response.status})`,
      };
    }

    return { ok: true, skipped: false, status: response.status, body };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
