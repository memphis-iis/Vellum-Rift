import type { GameSession } from "../api/sessions";

/** Playlist model ids from top-level or metadata (#141). */
export function sessionPlaylist(session: GameSession | null | undefined): string[] {
  if (!session) return [];
  if (Array.isArray(session.playlist)) {
    return session.playlist.filter((id): id is string => typeof id === "string" && id.trim() !== "");
  }
  const raw = session.metadata?.playlist;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim() !== "");
}

export function sessionActiveModelId(session: GameSession | null | undefined): string | null {
  if (!session) return null;
  if (typeof session.activeModelId === "string" && session.activeModelId.trim()) {
    return session.activeModelId.trim();
  }
  if (session.activeModelId === null) return null;
  const raw = session.metadata?.activeModelId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function shortModelLabel(modelId: string, label?: string | null): string {
  const name = label?.trim();
  if (name) return name.length > 40 ? `${name.slice(0, 38)}…` : name;
  return modelId.length > 12 ? `${modelId.slice(0, 8)}…` : modelId;
}
