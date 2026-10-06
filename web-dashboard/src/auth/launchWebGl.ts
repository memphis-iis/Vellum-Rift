import {
  mountWebGlAuthHandoff,
  AUTH_HANDOFF_READY,
  AUTH_HANDOFF_MESSAGE,
} from "./mountWebGlAuthHandoff";
import {
  readBearerTokenForApi,
  readHostEmail,
  readHostToken,
  readKioskToken,
} from "./tokenStorage";

export { AUTH_HANDOFF_READY, AUTH_HANDOFF_MESSAGE, mountWebGlAuthHandoff };

/** Derive the WebGL page origin from VITE_WEBGL_BASE_URL for postMessage targeting. */
export function webGlOriginFromBaseUrl(baseUrl: string): string | null {
  const raw = baseUrl.trim();
  if (!raw) return null;
  try {
    // Museum-kit relative path (/webgl/) shares the dashboard origin.
    if (raw.startsWith("/")) {
      if (typeof window !== "undefined" && window.location?.origin)
        return window.location.origin;
      return null;
    }
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function readDashboardAccessToken(): string | null {
  const host = readHostToken();
  if (host && host !== "local-dev") return host;
  const kiosk = readKioskToken();
  if (kiosk) return kiosk;
  return readBearerTokenForApi();
}

export function readDashboardEmail(): string {
  return readHostEmail();
}

/**
 * Open the Unity WebGL client and post the Bluekey access token via postMessage
 * (never put the token in the query string). Falls back to Unity's own Bluekey
 * popup when no dashboard token is available.
 *
 * Do not use `noopener` — we need the window reference (and the child needs
 * `window.opener` for the ready ping).
 */
export function launchWebGlWithAuthHandoff(options: {
  url: string;
  accessToken: string | null;
  email: string;
  webGlOrigin: string;
}): Window | null {
  const { url, accessToken, email, webGlOrigin } = options;
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
