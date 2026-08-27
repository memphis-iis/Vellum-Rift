/**
 * Session manuscript playlist helpers (#141).
 *
 * Playlist + active model live in `game_sessions.metadata` and are also
 * promoted onto the session JSON for dashboard / Unity consumers.
 */

export const PLAYLIST_KEY = "playlist";
export const ACTIVE_MODEL_ID_KEY = "activeModelId";

export type SessionPlaylistState = {
  playlist: string[];
  activeModelId: string | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Normalize a metadata bag into a canonical playlist + active model. */
export function readPlaylist(metadata: Record<string, unknown> | null | undefined): SessionPlaylistState {
  const raw = metadata?.[PLAYLIST_KEY];
  const playlist = Array.isArray(raw)
    ? [...new Set(raw.filter(isNonEmptyString).map((id) => id.trim()))]
    : [];

  const activeRaw = metadata?.[ACTIVE_MODEL_ID_KEY];
  let activeModelId: string | null = isNonEmptyString(activeRaw) ? activeRaw.trim() : null;
  if (activeModelId && !playlist.includes(activeModelId)) {
    activeModelId = null;
  }
  if (!playlist.length) {
    activeModelId = null;
  }

  return { playlist, activeModelId };
}

/** Write canonical playlist fields onto metadata (preserves other keys). */
export function writePlaylist(
  metadata: Record<string, unknown>,
  state: SessionPlaylistState,
): Record<string, unknown> {
  const next = { ...metadata };
  next[PLAYLIST_KEY] = [...state.playlist];
  if (state.activeModelId) {
    next[ACTIVE_MODEL_ID_KEY] = state.activeModelId;
  } else {
    delete next[ACTIVE_MODEL_ID_KEY];
  }
  return next;
}

/**
 * After playlist changes: keep active if still present; else first item or null.
 */
export function reconcileActive(
  playlist: string[],
  preferredActive: string | null | undefined,
): string | null {
  if (!playlist.length) return null;
  if (preferredActive && playlist.includes(preferredActive)) return preferredActive;
  return playlist[0] ?? null;
}

export type PlaylistPatchInput = {
  /** Replace the entire playlist when provided. */
  playlist?: unknown;
  /** Append one or more model ids (ignored when `playlist` is set). */
  append?: unknown;
  /** Remove one or more model ids (applied after replace/append). */
  remove?: unknown;
  /**
   * Set active model. `null` clears. When omitted, reconcile from previous /
   * first playlist entry.
   */
  activeModelId?: unknown;
};

function asIdList(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (isNonEmptyString(value)) return [value.trim()];
  if (!Array.isArray(value)) return null;
  return value.filter(isNonEmptyString).map((id) => id.trim());
}

export type PlaylistPatchResult =
  | { ok: true; state: SessionPlaylistState }
  | { ok: false; error: string; statusCode: number };

/**
 * Apply a playlist patch to current metadata. Does not validate model existence.
 */
export function applyPlaylistPatch(
  metadata: Record<string, unknown>,
  input: PlaylistPatchInput,
): PlaylistPatchResult {
  const current = readPlaylist(metadata);
  let playlist = [...current.playlist];

  if (input.playlist !== undefined) {
    const replaced = asIdList(input.playlist);
    if (replaced === null) {
      return { ok: false, error: "playlist must be an array of model id strings", statusCode: 400 };
    }
    playlist = [...new Set(replaced)];
  } else if (input.append !== undefined) {
    const toAdd = asIdList(input.append);
    if (toAdd === null || !toAdd.length) {
      return { ok: false, error: "append must be a model id or array of ids", statusCode: 400 };
    }
    for (const id of toAdd) {
      if (!playlist.includes(id)) playlist.push(id);
    }
  }

  if (input.remove !== undefined) {
    const toRemove = asIdList(input.remove);
    if (toRemove === null || !toRemove.length) {
      return { ok: false, error: "remove must be a model id or array of ids", statusCode: 400 };
    }
    const removeSet = new Set(toRemove);
    playlist = playlist.filter((id) => !removeSet.has(id));
  }

  let preferred: string | null | undefined = current.activeModelId;
  if (input.activeModelId !== undefined) {
    if (input.activeModelId === null) {
      preferred = null;
    } else if (isNonEmptyString(input.activeModelId)) {
      preferred = input.activeModelId.trim();
      if (!playlist.includes(preferred)) {
        return {
          ok: false,
          error: "activeModelId must be in the playlist",
          statusCode: 400,
        };
      }
    } else {
      return { ok: false, error: "activeModelId must be a string or null", statusCode: 400 };
    }
  }

  // Explicit null means clear even if playlist is non-empty.
  const activeModelId =
    input.activeModelId === null ? null : reconcileActive(playlist, preferred);

  return { ok: true, state: { playlist, activeModelId } };
}

export type ActiveModelPatchResult =
  | { ok: true; state: SessionPlaylistState }
  | { ok: false; error: string; statusCode: number };

export function applyActiveModelPatch(
  metadata: Record<string, unknown>,
  modelIdRaw: unknown,
): ActiveModelPatchResult {
  const current = readPlaylist(metadata);

  if (modelIdRaw === null) {
    return { ok: true, state: { playlist: current.playlist, activeModelId: null } };
  }
  if (!isNonEmptyString(modelIdRaw)) {
    return { ok: false, error: "modelId must be a string or null", statusCode: 400 };
  }
  const modelId = modelIdRaw.trim();
  if (!current.playlist.includes(modelId)) {
    return {
      ok: false,
      error: "modelId must be in the session playlist",
      statusCode: 400,
    };
  }
  return { ok: true, state: { playlist: current.playlist, activeModelId: modelId } };
}
