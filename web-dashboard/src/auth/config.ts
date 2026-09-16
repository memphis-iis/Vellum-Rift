/** Bluekey / dashboard auth configuration (Vite). */

export const BLUEKEY_PORTAL_URL =
  import.meta.env.VITE_BLUEKEY_PORTAL_URL ?? "https://iis.memphis.edu/static/bluekey/";

export const BLUEKEY_ORIGIN =
  import.meta.env.VITE_BLUEKEY_ORIGIN ?? "https://iis.memphis.edu";

export const BLUEKEY_SOFTWARE_ID = import.meta.env.VITE_BLUEKEY_SOFTWARE_ID ?? "";

/**
 * When true, the dashboard requires a Bluekey session (no local skip).
 * Default false so `pnpm dashboard:dev` works without an IdP.
 */
export const AUTH_REQUIRED = import.meta.env.VITE_AUTH_REQUIRED === "true";

export const TOKEN_STORAGE_KEY = "vellum_rift_access_token";
export const EMAIL_STORAGE_KEY = "vellum_rift_user_email";

/**
 * True when a Bearer token is a museum kiosk-join JWT (#249).
 * Decodes the payload without verifying signature (UI gating only).
 */
export function isKioskAccessToken(token: string | null | undefined): boolean {
  if (!token || token === "local-dev") return false;
  const parts = token.split(".");
  if (parts.length < 2) return false;
  try {
    const json = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { purpose?: unknown; sub?: unknown };
    if (payload.purpose === "kiosk-join") return true;
    return typeof payload.sub === "string" && payload.sub.startsWith("kiosk:");
  } catch {
    return false;
  }
}

export const VELLUM_LOGO_URL = "https://iis.memphis.edu/static/bluekey/icons/vellumrift.png";
export const MEMPHIS_PILLAR_URL =
  "https://www.memphis.edu/communications/brand/Images/pillar.png";
