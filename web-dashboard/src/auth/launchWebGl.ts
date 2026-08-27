import { TOKEN_STORAGE_KEY, EMAIL_STORAGE_KEY } from "../auth/config";

export const AUTH_HANDOFF_READY = "vellum-rift-webgl-ready";
export const AUTH_HANDOFF_MESSAGE = "vellum-rift-auth-handoff";

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

  if (!accessToken) {
    console.info("[VellumRift] No dashboard token — WebGL will use Bluekey popup fallback.");
    return win;
  }

  const payload = {
    type: AUTH_HANDOFF_MESSAGE,
    accessToken,
    email,
  };

  const post = () => {
    try {
      if (!win.closed) win.postMessage(payload, webGlOrigin);
    } catch (err) {
      console.warn("[VellumRift] Auth handoff postMessage failed:", err);
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== webGlOrigin) return;
    if (event.source !== win) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if ((data as { type?: string }).type !== AUTH_HANDOFF_READY) return;
    post();
  };

  window.addEventListener("message", onMessage);
  // Retry for a short window in case the ready ping was missed.
  const interval = window.setInterval(post, 400);
  window.setTimeout(() => {
    window.clearInterval(interval);
    window.removeEventListener("message", onMessage);
  }, 12000);

  // Immediate attempt (Unity may already be listening).
  post();
  return win;
}
