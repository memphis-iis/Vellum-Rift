import { TOKEN_STORAGE_KEY, EMAIL_STORAGE_KEY } from "../auth/config";
import {
  mountWebGlAuthHandoff,
  AUTH_HANDOFF_READY,
  AUTH_HANDOFF_MESSAGE,
} from "./mountWebGlAuthHandoff";

export { AUTH_HANDOFF_READY, AUTH_HANDOFF_MESSAGE, mountWebGlAuthHandoff };

/** Derive the WebGL page origin from VITE_WEBGL_BASE_URL for postMessage targeting. */
export function webGlOriginFromBaseUrl(baseUrl: string): string | null {
  const raw = baseUrl.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function readDashboardAccessToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token || token === "local-dev") return null;
    return token;
  } catch {
    return null;
  }
}

export function readDashboardEmail(): string {
  try {
    return sessionStorage.getItem(EMAIL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Open the Unity WebGL client and post the Bluekey access token via postMessage
 * (never put the token in the query string). Falls back to Unity's own Bluekey
 * popup when no dashboard token is available.
 *
 * Do not use `noopener` — we need the window reference (and the child needs
 * `window.opener` for the ready ping).
 *
 * Also mirrors the token into sessionStorage + BroadcastChannel so same-tab /
 * opener-less WebGL loads can pick it up (#254).
 */
export function broadcastWebGlAuth(accessToken: string | null, email = ""): void {
  if (!accessToken) return;
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    if (email) sessionStorage.setItem(EMAIL_STORAGE_KEY, email);
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel("vellum-rift-auth");
    bc.postMessage({
      type: AUTH_HANDOFF_MESSAGE,
      accessToken,
      email,
    });
    bc.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

export function launchWebGlWithAuthHandoff(options: {
  url: string;
  accessToken: string | null;
  email: string;
  webGlOrigin: string;
}): Window | null {
  const { url, accessToken, email, webGlOrigin } = options;
  broadcastWebGlAuth(accessToken, email);

  const win = window.open(url, "vellumRiftWebGL");
  if (!win) {
    console.warn("[VellumRift] WebGL launch blocked — allow popups for this site.");
    return null;
  }

  mountWebGlAuthHandoff({
    target: win,
    accessToken,
    email,
    webGlOrigin,
  });
  return win;
}

/** Same-tab WebGL launch when popups are blocked (#254). */
export function launchWebGlSameTab(options: {
  url: string;
  accessToken: string | null;
  email?: string;
}): void {
  broadcastWebGlAuth(options.accessToken, options.email ?? "");
  window.location.assign(options.url);
}
