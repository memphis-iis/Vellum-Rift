/**
 * CORS allowlist + baseline security headers (#265).
 */

import type { RequestHandler } from "express";

const DEFAULT_ORIGINS = [
  "https://iis.memphis.edu",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

/** Parse CORS_ALLOWED_ORIGINS (comma-separated). Empty → safe defaults. */
export function corsAllowedOrigins(
  env = process.env.CORS_ALLOWED_ORIGINS,
): string[] {
  const raw = String(env ?? "").trim();
  if (!raw) return [...DEFAULT_ORIGINS];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Reflect only allowlisted Origins. Never `*`.
 * When Origin is absent (curl / server-to-server), omit ACAO.
 */
export function corsOriginOption(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean | string) => void,
  allowlist = corsAllowedOrigins(),
): void {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (allowlist.includes(origin)) {
    callback(null, origin);
    return;
  }
  callback(null, false);
}

/** Baseline API hardening headers (CSP for HTML is a Caddy/static concern). */
export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.removeHeader("X-Powered-By");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    // API is not framed; dashboard/WebGL embed themselves elsewhere.
    res.setHeader("X-Frame-Options", "DENY");
    next();
  };
}
