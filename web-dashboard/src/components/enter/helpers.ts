import type { CSSProperties } from "react";
import { API_BASE_URL } from "../../api/config";
import type { GameSession, PlayerState } from "../../api/gameState";

export type CopyKind = "invite" | "desktop" | "kiosk" | "share" | "observer";
export type EnterMode = "play" | "observer";

export function displayNameFromEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "Learner";
  const local = trimmed.split("@")[0]?.trim();
  return local || trimmed;
}

export function formatHelpRequestTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function shortSessionLabel(label: string | undefined, sessionId: string): string {
  const name = label?.trim();
  if (name) return name.length > 28 ? `${name.slice(0, 26)}…` : name;
  return sessionId.length > 12 ? `${sessionId.slice(0, 8)}…` : sessionId;
}

type DesktopCommandArgs = {
  sessionId: string;
  playerName: string;
  isHost: boolean;
  accessToken: string | null;
  playerId?: string | null;
};

export function buildDesktopCommand(args: DesktopCommandArgs): string {
  const parts = [
    "./VellumRift",
    `-backendUrl=${API_BASE_URL}`,
    `-session=${args.sessionId}`,
    `-playerName=${args.playerName}`,
    `-isHost=${args.isHost ? "true" : "false"}`,
  ];
  if (args.playerId) parts.push(`-playerId=${args.playerId}`);
  if (args.accessToken) parts.push(`-accessToken=${args.accessToken}`);
  return parts.join(" ");
}

/** Place avatars on the schematic ring from player positions or a stable hash. */
export function avatarStyle(player: PlayerState, index: number, total: number): CSSProperties {
  const hasPos = Number.isFinite(player.position?.x) && Number.isFinite(player.position?.z);
  if (hasPos) {
    const nx = Math.max(-1, Math.min(1, player.position.x / 50));
    const nz = Math.max(-1, Math.min(1, player.position.z / 50));
    return { left: `${50 + nx * 32}%`, top: `${50 + nz * 32}%` };
  }
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const r = 28;
  return {
    left: `${50 + Math.cos(angle) * r}%`,
    top: `${50 + Math.sin(angle) * r}%`,
  };
}

/** Session link with the given query params (falls back to the bare id). */
export function sessionLink(sessionId: string, extra: Record<string, string> = {}): string {
  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("session", sessionId);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    return url.toString();
  } catch {
    return sessionId;
  }
}

export function initialEnterMode(): EnterMode {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("observer") === "1" || params.get("mode") === "observer") return "observer";
  } catch {
    return "play";
  }
  return "play";
}

function clampDepth(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : null;
}

export function readDepthScale(session: GameSession | null): number {
  return clampDepth(session?.depthScale) ?? clampDepth(session?.metadata?.depthScale) ?? 1;
}

function metaString(top: unknown, meta: unknown): string {
  if (typeof top === "string" && top.trim()) return top.trim();
  return typeof meta === "string" ? meta.trim() : "";
}

export function readDemoDrafts(session: GameSession | null): { category: string; summary: string } {
  return {
    category: metaString(session?.demoCategory, session?.metadata?.demoCategory) || "Examples",
    summary: metaString(session?.demoSummary, session?.metadata?.demoSummary),
  };
}

export function readFlag(session: GameSession | null, key: "kioskEnabled" | "demoEnabled"): boolean {
  return session?.[key] === true || session?.metadata?.[key] === true;
}

type InviteResult = { deliveryStatus?: string; recipientEmail: string; deliveryError?: string | null };

export function inviteResultMessage(result: InviteResult): string {
  const to = result.recipientEmail;
  switch (result.deliveryStatus) {
    case "sent":
      return `Invite emailed to ${to}`;
    case "skipped":
      return `Invite saved for ${to} (email delivery not configured)`;
    case "failed":
      return `Invite saved but email failed${result.deliveryError ? `: ${result.deliveryError}` : ""}`;
    default:
      return `Invite recorded for ${to}`;
  }
}
