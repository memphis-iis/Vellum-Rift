import { API_BASE_URL } from "./config";
import { getAuthHeaders } from "./authHeaders";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  id: string;
  displayName: string;
  position: Vec3;
  rotation: Vec3;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: string;
  laserActive?: boolean;
  laserOrigin?: Vec3;
  laserDirection?: { dx: number; dy: number; dz: number };
  bluekeySub?: string | null;
  bluekeyEmail?: string | null;
  chatMuted?: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  sentAt: string;
  /** True for server-generated notices (e.g. "Player joined the session"). */
  system?: boolean;
}

export interface GameSession {
  sessionId: string;
  label: string;
  hostId: string;
  players: PlayerState[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  visibility?: "public" | "private";
  createdBySub?: string;
  createdByEmail?: string;
  playlist?: string[];
  activeModelId?: string | null;
  metadata?: Record<string, unknown>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: getAuthHeaders(init?.headers),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getSession(sessionId: string): Promise<GameSession> {
  return request<GameSession>(`/api/game-state/${encodeURIComponent(sessionId)}`);
}

export function createSession(label?: string): Promise<GameSession> {
  return request<GameSession>("/api/game-state", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function addPlayer(
  sessionId: string,
  displayName: string,
  isHost = false,
): Promise<PlayerState> {
  return request<PlayerState>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players`,
    {
      method: "POST",
      body: JSON.stringify({ displayName, isHost }),
    },
  );
}

export async function fetchChat(sessionId: string): Promise<ChatMessage[]> {
  const data = await request<{ messages: ChatMessage[] }>(
    `/api/game-state/${encodeURIComponent(sessionId)}/chat`,
  );
  return data.messages ?? [];
}

export async function postChat(
  sessionId: string,
  playerId: string,
  text: string,
): Promise<ChatMessage> {
  const data = await request<{ message: ChatMessage }>(
    `/api/game-state/${encodeURIComponent(sessionId)}/chat`,
    {
      method: "POST",
      body: JSON.stringify({ playerId, text }),
    },
  );
  return data.message;
}

export interface SessionInviteResult {
  notificationId: string;
  joinUrl: string | null;
  deliveryStatus: string;
  deliveryError: string | null;
  recipientEmail: string;
}

export function inviteToSession(
  sessionId: string,
  recipientEmail: string,
  options?: { addToAllowlist?: boolean },
): Promise<SessionInviteResult> {
  return request<SessionInviteResult>(
    `/api/game-state/${encodeURIComponent(sessionId)}/invite`,
    {
      method: "POST",
      body: JSON.stringify({
        recipientEmail,
        addToAllowlist: options?.addToAllowlist === true,
      }),
    },
  );
}

export type AllowlistEntry = {
  id: string;
  sessionId: string;
  subjectSub: string | null;
  email: string | null;
  createdAt: string;
};

export function fetchAllowlist(sessionId: string): Promise<AllowlistEntry[]> {
  return request<AllowlistEntry[]>(
    `/api/game-state/${encodeURIComponent(sessionId)}/allowlist`,
  );
}

export function addAllowlistEmail(
  sessionId: string,
  email: string,
): Promise<AllowlistEntry> {
  return request<AllowlistEntry>(
    `/api/game-state/${encodeURIComponent(sessionId)}/allowlist`,
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export function removeAllowlistEntry(
  sessionId: string,
  entryId: string,
): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/allowlist/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
}

export function setSessionVisibility(
  sessionId: string,
  visibility: "public" | "private",
): Promise<GameSession> {
  return request<GameSession>(
    `/api/game-state/${encodeURIComponent(sessionId)}/visibility`,
    {
      method: "PATCH",
      body: JSON.stringify({ visibility }),
    },
  );
}

export function kickPlayer(sessionId: string, playerId: string): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/kick`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function mutePlayer(sessionId: string, playerId: string): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/mute`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function unmutePlayer(sessionId: string, playerId: string): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/unmute`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function transferHost(sessionId: string, playerId: string): Promise<GameSession> {
  return request<GameSession>(
    `/api/game-state/${encodeURIComponent(sessionId)}/host`,
    {
      method: "PATCH",
      body: JSON.stringify({ playerId }),
    },
  );
}
