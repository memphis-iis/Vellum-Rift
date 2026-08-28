import { API_BASE_URL } from "./config";

/**
 * Build a WebGL launch URL. Caddy serves the client under `/vellumrift/*`
 * (trailing slash required); bare `/vellumrift?…` returns 404.
 */
export function buildWebGlLaunchUrl(options: {
  sessionId: string;
  playerName: string;
  isHost: boolean;
  kiosk?: boolean;
  /** Canvas-only mode for dashboard iframe embed */
  embed?: boolean;
}): string | null {
  const raw = (import.meta.env.VITE_WEBGL_BASE_URL ?? "").trim();
  if (!raw) return null;

  const withSlash = raw.endsWith("/") ? raw : `${raw}/`;
  const url = new URL(withSlash.includes("://") ? withSlash : `https://${withSlash}`);
  // Ensure pathname ends with `/` even if env was host-only.
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  url.searchParams.set("session", options.sessionId);
  url.searchParams.set("playerName", options.playerName);
  url.searchParams.set("isHost", options.isHost ? "true" : "false");
  url.searchParams.set("backendUrl", API_BASE_URL);
  if (options.kiosk) url.searchParams.set("kiosk", "1");
  if (options.embed) url.searchParams.set("embed", "1");
  return url.toString();
}
