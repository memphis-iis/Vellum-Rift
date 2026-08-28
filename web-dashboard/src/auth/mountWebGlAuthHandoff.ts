export const AUTH_HANDOFF_READY = "vellum-rift-webgl-ready";
export const AUTH_HANDOFF_MESSAGE = "vellum-rift-auth-handoff";

export type WebGlAuthHandoffOptions = {
  /** Popup window or iframe contentWindow */
  target: Window;
  webGlOrigin: string;
  accessToken: string | null;
  email: string;
};

/**
 * Wire postMessage auth handoff to a WebGL client (popup or iframe).
 * Returns cleanup — call on unmount.
 */
export function mountWebGlAuthHandoff(options: WebGlAuthHandoffOptions): () => void {
  const { target, webGlOrigin, accessToken, email } = options;

  if (!accessToken) {
    console.info("[VellumRift] No dashboard token — WebGL will use Bluekey popup fallback.");
    return () => {};
  }

  const payload = {
    type: AUTH_HANDOFF_MESSAGE,
    accessToken,
    email,
  };

  const post = () => {
    try {
      if (!target.closed) target.postMessage(payload, webGlOrigin);
    } catch (err) {
      console.warn("[VellumRift] Auth handoff postMessage failed:", err);
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== webGlOrigin) return;
    if (event.source !== target) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if ((data as { type?: string }).type !== AUTH_HANDOFF_READY) return;
    post();
  };

  window.addEventListener("message", onMessage);
  const interval = window.setInterval(post, 400);
  const timeout = window.setTimeout(() => {
    window.clearInterval(interval);
    window.removeEventListener("message", onMessage);
  }, 12000);

  post();

  return () => {
    window.clearInterval(interval);
    window.clearTimeout(timeout);
    window.removeEventListener("message", onMessage);
  };
}
