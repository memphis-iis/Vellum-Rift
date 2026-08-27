/**
 * Session event chrome (#146).
 * kind + optional schedule live in game_sessions.metadata.
 */

export const KIND_KEY = "kind";
export const STARTS_AT_KEY = "startsAt";
export const ENDS_AT_KEY = "endsAt";

export type SessionKind = "exploration" | "event";

export type SessionEventState = {
  kind: SessionKind;
  startsAt: string | null;
  endsAt: string | null;
};

export function parseSessionKind(input: unknown): SessionKind | null {
  if (input === "exploration" || input === "event") return input;
  return null;
}

function parseOptionalIso(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null || input === "") return null;
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const t = Date.parse(trimmed);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t).toISOString();
}

export function readSessionEvent(
  metadata: Record<string, unknown> | null | undefined,
): SessionEventState {
  const kind = parseSessionKind(metadata?.[KIND_KEY]) ?? "exploration";
  const startsRaw = metadata?.[STARTS_AT_KEY];
  const endsRaw = metadata?.[ENDS_AT_KEY];
  const startsAt =
    typeof startsRaw === "string" && Number.isFinite(Date.parse(startsRaw))
      ? new Date(Date.parse(startsRaw)).toISOString()
      : null;
  const endsAt =
    typeof endsRaw === "string" && Number.isFinite(Date.parse(endsRaw))
      ? new Date(Date.parse(endsRaw)).toISOString()
      : null;
  return { kind, startsAt, endsAt };
}

export function writeSessionEvent(
  metadata: Record<string, unknown>,
  state: SessionEventState,
): Record<string, unknown> {
  const next = { ...metadata };
  if (state.kind === "exploration") {
    delete next[KIND_KEY];
  } else {
    next[KIND_KEY] = state.kind;
  }
  if (state.startsAt) next[STARTS_AT_KEY] = state.startsAt;
  else delete next[STARTS_AT_KEY];
  if (state.endsAt) next[ENDS_AT_KEY] = state.endsAt;
  else delete next[ENDS_AT_KEY];
  return next;
}

export type EventPatchInput = {
  kind?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
};

/**
 * Apply a partial event chrome patch. Returns null when the body is invalid.
 */
export function applyEventPatch(
  metadata: Record<string, unknown>,
  patch: EventPatchInput,
): { ok: true; metadata: Record<string, unknown> } | { ok: false; error: string } {
  const current = readSessionEvent(metadata);
  let kind = current.kind;
  let startsAt = current.startsAt;
  let endsAt = current.endsAt;

  if (patch.kind !== undefined) {
    const parsed = parseSessionKind(patch.kind);
    if (!parsed) {
      return { ok: false, error: "kind must be 'exploration' or 'event'" };
    }
    kind = parsed;
  }

  if (patch.startsAt !== undefined) {
    const parsed = parseOptionalIso(patch.startsAt);
    if (parsed === undefined) {
      return { ok: false, error: "startsAt must be an ISO datetime or null" };
    }
    startsAt = parsed;
  }

  if (patch.endsAt !== undefined) {
    const parsed = parseOptionalIso(patch.endsAt);
    if (parsed === undefined) {
      return { ok: false, error: "endsAt must be an ISO datetime or null" };
    }
    endsAt = parsed;
  }

  if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    return { ok: false, error: "endsAt must be at or after startsAt" };
  }

  return {
    ok: true,
    metadata: writeSessionEvent(metadata, { kind, startsAt, endsAt }),
  };
}
