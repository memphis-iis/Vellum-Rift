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
): Promise<SessionInviteResult> {
  return request<SessionInviteResult>(
    `/api/game-state/${encodeURIComponent(sessionId)}/invite`,
    {
      method: "POST",
      body: JSON.stringify({ recipientEmail }),
    },
  );
}
