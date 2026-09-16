import { API_BASE_URL } from "../api/config";

/** Custom URL scheme registered by the Vellum Rift desktop launcher. */
export const DESKTOP_LAUNCH_PROTOCOL =
  import.meta.env.VITE_DESKTOP_LAUNCH_PROTOCOL ?? "vellumrift";

export type DesktopLaunchParams = {
  sessionId: string;
  playerName: string;
  isHost: boolean;
  accessToken: string;
  backendUrl?: string;
};

/** Build a `vellumrift://join?...` handoff URL (token travels OS-side, not browser history). */
export function buildDesktopLaunchUrl(params: DesktopLaunchParams): string {
  const url = new URL(`${DESKTOP_LAUNCH_PROTOCOL}://join`);
  url.searchParams.set("session", params.sessionId);
  url.searchParams.set("playerName", params.playerName);
  url.searchParams.set("isHost", params.isHost ? "true" : "false");
  url.searchParams.set("backendUrl", params.backendUrl ?? API_BASE_URL);
  url.searchParams.set("accessToken", params.accessToken);
  return url.toString();
}

/** CLI fallback for advanced users / environments without a protocol handler.
 * Never include accessToken — tokens must not appear in copied shell history (#266).
 */
export function buildDesktopCommand(params: Omit<DesktopLaunchParams, "accessToken"> & {
  accessToken?: string;
}): string {
  const parts = [
    "./VellumRift",
    `-backendUrl=${params.backendUrl ?? API_BASE_URL}`,
    `-session=${params.sessionId}`,
    `-playerName=${params.playerName}`,
    `-isHost=${params.isHost ? "true" : "false"}`,
  ];
  return parts.join(" ");
}

/**
 * Open the registered desktop launcher via custom protocol.
 * Returns false when the environment blocks custom schemes (copy CLI instead).
 */
export function tryOpenDesktopLaunchUrl(params: DesktopLaunchParams): boolean {
  const href = buildDesktopLaunchUrl(params);
  try {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}
