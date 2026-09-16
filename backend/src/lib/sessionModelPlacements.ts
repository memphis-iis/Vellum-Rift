/**
 * Per-model gallery transforms + selection (#167 / #169).
 *
 * Stored in `game_sessions.metadata` and promoted on session JSON.
 */

export const SELECTED_MODEL_ID_KEY = "selectedModelId";
export const MODEL_PLACEMENTS_KEY = "modelPlacements";

export type ModelPlacement = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

export type SessionModelPlacementState = {
  selectedModelId: string | null;
  modelPlacements: Record<string, ModelPlacement>;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseVec3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const nums = value.slice(0, 3).map((n) => Number(n));
  if (!nums.every(isFiniteNumber)) return null;
  return [nums[0], nums[1], nums[2]];
}

export function defaultPlacement(): ModelPlacement {
  return { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: 1 };
}

function parsePlacement(value: unknown): ModelPlacement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const position = parseVec3(raw.position);
  const rotation = parseVec3(raw.rotation);
  const scale = raw.scale === undefined ? 1 : Number(raw.scale);
  if (!position || !rotation || !isFiniteNumber(scale) || scale <= 0) return null;
  return { position, rotation, scale };
}

/** Normalize metadata into canonical placement state. */
export function readModelPlacements(
  metadata: Record<string, unknown> | null | undefined,
  playlist: string[] = [],
): SessionModelPlacementState {
  const placementsRaw = metadata?.[MODEL_PLACEMENTS_KEY];
  const modelPlacements: Record<string, ModelPlacement> = {};

  if (placementsRaw && typeof placementsRaw === "object" && !Array.isArray(placementsRaw)) {
    for (const [modelId, value] of Object.entries(placementsRaw as Record<string, unknown>)) {
      if (!isNonEmptyString(modelId)) continue;
      const parsed = parsePlacement(value);
      if (parsed) modelPlacements[modelId.trim()] = parsed;
    }
  }

  const selectedRaw = metadata?.[SELECTED_MODEL_ID_KEY];
  let selectedModelId: string | null = isNonEmptyString(selectedRaw) ? selectedRaw.trim() : null;
  if (selectedModelId && !playlist.includes(selectedModelId)) {
    selectedModelId = null;
  }
  if (!playlist.length) {
    selectedModelId = null;
  }

  return { selectedModelId, modelPlacements };
}

/** Write canonical placement fields onto metadata (preserves other keys). */
export function writeModelPlacements(
  metadata: Record<string, unknown>,
  state: SessionModelPlacementState,
): Record<string, unknown> {
  const next = { ...metadata };
  const placements: Record<string, ModelPlacement> = {};
  for (const [modelId, placement] of Object.entries(state.modelPlacements)) {
    placements[modelId] = placement;
  }
  next[MODEL_PLACEMENTS_KEY] = placements;
  if (state.selectedModelId) {
    next[SELECTED_MODEL_ID_KEY] = state.selectedModelId;
  } else {
    delete next[SELECTED_MODEL_ID_KEY];
  }
  return next;
}

/** Drop placement keys not in playlist; seed defaults for new ids. */
export function syncPlacementsWithPlaylist(
  playlist: string[],
  placements: Record<string, ModelPlacement>,
  seeds?: Record<string, ModelPlacement>,
): Record<string, ModelPlacement> {
  const next: Record<string, ModelPlacement> = {};
  for (const modelId of playlist) {
    const seed = seeds?.[modelId];
    next[modelId] = placements[modelId] ?? seed ?? defaultPlacement();
  }
  return next;
}

export function parsePlacementSeeds(value: unknown): Record<string, ModelPlacement> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const seeds: Record<string, ModelPlacement> = {};
  for (const [modelId, placementValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof modelId !== "string" || !modelId.trim()) continue;
    const parsed = parsePlacement(placementValue);
    if (!parsed) return null;
    seeds[modelId.trim()] = parsed;
  }
  return seeds;
}

export function reconcileSelectedModel(
  playlist: string[],
  preferred: string | null | undefined,
): string | null {
  if (!playlist.length) return null;
  if (preferred && playlist.includes(preferred)) return preferred;
  return playlist[0] ?? null;
}

export type ModelPlacementsPatchInput = {
  placements?: unknown;
  selectedModelId?: unknown;
  remove?: unknown;
};

export type ModelPlacementsPatchResult =
  | { ok: true; state: SessionModelPlacementState }
  | { ok: false; error: string; statusCode: number };

function asIdList(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (isNonEmptyString(value)) return [value.trim()];
  if (!Array.isArray(value)) return null;
  return value.filter(isNonEmptyString).map((id) => id.trim());
}

/**
 * Apply a placement patch. Caller must pass the current playlist for validation.
 */
export function applyModelPlacementsPatch(
  metadata: Record<string, unknown>,
  playlist: string[],
  input: ModelPlacementsPatchInput,
): ModelPlacementsPatchResult {
  const current = readModelPlacements(metadata, playlist);
  let modelPlacements = { ...current.modelPlacements };

  if (input.remove !== undefined) {
    const toRemove = asIdList(input.remove);
    if (toRemove === null || !toRemove.length) {
      return { ok: false, error: "remove must be a model id or array of ids", statusCode: 400 };
    }
    for (const id of toRemove) {
      delete modelPlacements[id];
    }
  }

  if (input.placements !== undefined) {
    if (!input.placements || typeof input.placements !== "object" || Array.isArray(input.placements)) {
      return { ok: false, error: "placements must be an object keyed by model id", statusCode: 400 };
    }
    for (const [modelId, value] of Object.entries(input.placements as Record<string, unknown>)) {
      if (!isNonEmptyString(modelId)) continue;
      const id = modelId.trim();
      if (!playlist.includes(id)) {
        return { ok: false, error: `placement model id must be in playlist: ${id}`, statusCode: 400 };
      }
      const parsed = parsePlacement(value);
      if (!parsed) {
        return { ok: false, error: `invalid placement for model ${id}`, statusCode: 400 };
      }
      modelPlacements[id] = parsed;
    }
  }

  let selectedModelId = current.selectedModelId;
  if (input.selectedModelId !== undefined) {
    if (input.selectedModelId === null) {
      selectedModelId = null;
    } else if (isNonEmptyString(input.selectedModelId)) {
      const id = input.selectedModelId.trim();
      if (!playlist.includes(id)) {
        return { ok: false, error: "selectedModelId must be in the playlist", statusCode: 400 };
      }
      selectedModelId = id;
    } else {
      return { ok: false, error: "selectedModelId must be a string or null", statusCode: 400 };
    }
  } else {
    selectedModelId = reconcileSelectedModel(playlist, selectedModelId);
  }

  return { ok: true, state: { selectedModelId, modelPlacements } };
}
