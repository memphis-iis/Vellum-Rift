/**
 * Bluekey public error intake for the dashboard (#289).
 * POST {VITE_BLUEKEY_API_BASE_URL}/public/errors/submit — no Bearer.
 * Mirrors undertaker-mobile/services/bluekeyErrorReporter.ts contract.
 */

import { BLUEKEY_API_BASE_URL, BLUEKEY_SOFTWARE_ID } from "../auth/config";

const DEDUPE_WINDOW_MS = 60_000;

let lastDedupeKey = "";
let lastDedupeAt = 0;
let installed = false;

function resolveApiBase(): string {
  return String(BLUEKEY_API_BASE_URL || "").replace(/\/$/, "");
}

function resolveAppId(): string {
  return (BLUEKEY_SOFTWARE_ID || "").trim();
}

function isEnabled(): boolean {
  const flag = String(
    import.meta.env.VITE_BLUEKEY_ERROR_REPORTING_ENABLED ?? "",
  )
    .trim()
    .toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return Boolean(resolveAppId());
}

/** Scrub Bearer tokens, query tokens, and emails. */
export function scrubText(value: string, maxLen: number): string {
  let cleaned = String(value ?? "");
  cleaned = cleaned.replace(/Bearer\s+[A-Za-z0-9._\-+=/]+/gi, "Bearer [redacted]");
  cleaned = cleaned.replace(
    /((?:access[_-]?token|refresh[_-]?token|token|code)=)([^&\s#]+)/gi,
    "$1[redacted]",
  );
  cleaned = cleaned.replace(
    /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
    "[email]",
  );
  if (cleaned.length > maxLen) cleaned = `${cleaned.slice(0, maxLen)}…`;
  return cleaned;
}

export function shouldDedupe(message: string, source: string, now = Date.now()): boolean {
  const key = `${source}::${message.slice(0, 240)}`;
  if (key === lastDedupeKey && now - lastDedupeAt < DEDUPE_WINDOW_MS) return true;
  lastDedupeKey = key;
  lastDedupeAt = now;
  return false;
}

export function resetDedupeForTests(): void {
  lastDedupeKey = "";
  lastDedupeAt = 0;
}

export type BluekeyErrorInput = {
  message: string;
  title?: string;
  stackTrace?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
};

export async function reportBluekeyError(input: BluekeyErrorInput): Promise<boolean> {
  if (!isEnabled()) return false;
  const message = scrubText(input.message, 4000).trim();
  if (!message) return false;
  const source = input.source || "dashboard";
  if (shouldDedupe(message, source)) return false;

  const payload = {
    appId: resolveAppId(),
    appVersion: import.meta.env.VITE_APP_VERSION || "0.0.0",
    environment: import.meta.env.DEV ? "development" : "production",
    title: scrubText(input.title || "Vellum Rift dashboard error", 300),
    message,
    stackTrace: input.stackTrace
      ? scrubText(String(input.stackTrace), 12000) || undefined
      : undefined,
    pageUrl: scrubText(
      typeof window !== "undefined" ? window.location.href : "",
      2048,
    ) || undefined,
    metadata: {
      platform: "web",
      source,
      ...(input.metadata || {}),
    },
  };

  try {
    const res = await fetch(`${resolveApiBase()}/public/errors/submit`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Install window.onerror + unhandledrejection handlers once. */
export function installBluekeyErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  if (!isEnabled()) return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error;
    void reportBluekeyError({
      title: "Vellum Rift dashboard uncaught error",
      message: err?.message || event.message || "Unknown error",
      stackTrace: err?.stack || null,
      source: "window.onerror",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const stack = reason instanceof Error ? reason.stack : null;
    void reportBluekeyError({
      title: "Vellum Rift dashboard unhandled rejection",
      message,
      stackTrace: stack,
      source: "unhandledrejection",
    });
  });
}
