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

export const VELLUM_LOGO_URL = "https://iis.memphis.edu/static/bluekey/icons/vellumrift.png";
export const MEMPHIS_PILLAR_URL =
  "https://www.memphis.edu/communications/brand/Images/pillar.png";
