import { API_BASE_URL } from "./config";
import { TOKEN_STORAGE_KEY } from "../auth/config";

function authHeaders(json = false): Headers {
  const headers = new Headers();
  try {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (token && token !== "local-dev") {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    /* ignore */
  }
  if (json) headers.set("Content-Type", "application/json");
  return headers;
}

export type SessionPlayer = {
  id: string;
  displayName?: string;
  isConnected?: boolean;
  isHost?: boolean;
};

export type GameSession = {
  sessionId: string;
  label: string;
  hostId: string;
  players: SessionPlayer[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  visibility?: "public" | "private";
  createdBySub?: string;
  createdByEmail?: string;
  metadata?: Record<string, unknown>;
};

export async function fetchSessions(): Promise<GameSession[]> {
  const res = await fetch(`${API_BASE_URL}/api/game-state`, {
    headers: authHeaders(true),
  });
  const data = (await res.json().catch(() => null)) as GameSession[] | { error?: string } | null;
  if (!res.ok) {
    const err = data && !Array.isArray(data) ? data.error : undefined;
    throw new Error(err || `Session list failed (${res.status})`);
  }
  return Array.isArray(data) ? data : [];
}

export async function createSession(
  label?: string,
  visibility: "public" | "private" = "private",
): Promise<GameSession> {
  const res = await fetch(`${API_BASE_URL}/api/game-state`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ label: label?.trim() || undefined, visibility }),
  });
  const data = (await res.json().catch(() => ({}))) as GameSession & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Create session failed (${res.status})`);
  }
  return data;
}

export async function resumeSession(sessionId: string): Promise<GameSession> {
  const res = await fetch(
    `${API_BASE_URL}/api/game-state/${encodeURIComponent(sessionId)}/resume`,
    {
      method: "POST",
      headers: authHeaders(true),
    },
  );
  const data = (await res.json().catch(() => ({}))) as GameSession & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Resume session failed (${res.status})`);
  }
  return data;
}

export async function endSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/game-state/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: authHeaders(true),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `End session failed (${res.status})`);
  }
}
