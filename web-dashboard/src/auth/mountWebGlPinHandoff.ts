export const PIN_NAME_REQUEST = "vellum-rift-pin-name-request";
export const PIN_NAME_RESULT = "vellum-rift-pin-name-result";

export type PinNameRequestPayload = {
  type: typeof PIN_NAME_REQUEST;
  mode: "place" | "rename";
  x: number;
  y: number;
  z: number;
  artifactId?: string;
  currentLabel?: string;
};

export type PinNameResultPayload = {
  type: typeof PIN_NAME_RESULT;
  label?: string;
  cancelled?: boolean;
};

export type WebGlPinHandoffOptions = {
  iframe: HTMLIFrameElement;
  webGlOrigin: string;
  onRequest: (payload: Omit<PinNameRequestPayload, "type">) => void;
};

/**
 * Listen for pin-name requests from an embedded Unity WebGL iframe.
 */
export function mountWebGlPinHandoff(options: WebGlPinHandoffOptions): () => void {
  const { iframe, webGlOrigin, onRequest } = options;

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== webGlOrigin) return;
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if ((data as { type?: string }).type !== PIN_NAME_REQUEST) return;
    const payload = data as PinNameRequestPayload;
    onRequest({
      mode: payload.mode,
      x: payload.x,
      y: payload.y,
      z: payload.z,
      artifactId: payload.artifactId,
      currentLabel: payload.currentLabel,
    });
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

export function postPinNameResult(
  iframe: HTMLIFrameElement,
  webGlOrigin: string,
  result: Omit<PinNameResultPayload, "type">,
): void {
  const win = iframe.contentWindow;
  if (!win) return;
  try {
    win.postMessage({ type: PIN_NAME_RESULT, ...result }, webGlOrigin);
  } catch (err) {
    console.warn("[VellumRift] Pin name result postMessage failed:", err);
  }
}
