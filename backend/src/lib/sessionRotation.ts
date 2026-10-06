/**
 * Museum host turn timer (rotation) stored in game_sessions.metadata.
 * experiencePhase + rotationEndsAt are server-authoritative: the host starts a
 * turn with a preset length and the server clock computes the end time.
 */

export const EXPERIENCE_PHASE_KEY = "experiencePhase";
export const ROTATION_ENDS_AT_KEY = "rotationEndsAt";

/** Allowed turn lengths in minutes. */
export const ROTATION_MINUTE_PRESETS = [5, 8, 10, 12] as const;
export type RotationMinutes = (typeof ROTATION_MINUTE_PRESETS)[number];

export type ExperiencePhase = "playing" | "ended";

export type SessionRotationState = {
  experiencePhase: ExperiencePhase;
  rotationEndsAt: string | null;
};

export function parseExperiencePhase(input: unknown): ExperiencePhase | null {
  if (input === "playing" || input === "ended") return input;
  return null;
}

export function parseRotationMinutes(input: unknown): RotationMinutes | null {
  if (typeof input !== "number" || !Number.isInteger(input)) return null;
  return (ROTATION_MINUTE_PRESETS as readonly number[]).includes(input)
    ? (input as RotationMinutes)
    : null;
}

/**
 * Read rotation state from metadata. A playing turn whose end time has passed
 * is clamped to "ended" (server-authoritative; nothing is persisted on read).
 * Sessions that never started a turn default to playing with no timer.
 */
export function readSessionRotation(
  metadata: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
): SessionRotationState {
  const phase = parseExperiencePhase(metadata?.[EXPERIENCE_PHASE_KEY]) ?? "playing";
  const endsRaw = metadata?.[ROTATION_ENDS_AT_KEY];
  const endsMs = typeof endsRaw === "string" ? Date.parse(endsRaw) : NaN;
  const rotationEndsAt = Number.isFinite(endsMs) ? new Date(endsMs).toISOString() : null;

  if (phase === "ended") {
    return { experiencePhase: "ended", rotationEndsAt };
  }
  if (rotationEndsAt && nowMs >= Date.parse(rotationEndsAt)) {
    return { experiencePhase: "ended", rotationEndsAt };
  }
  return { experiencePhase: "playing", rotationEndsAt };
}

export function writeSessionRotation(
  metadata: Record<string, unknown>,
  state: SessionRotationState,
): Record<string, unknown> {
  const next = { ...metadata };
  next[EXPERIENCE_PHASE_KEY] = state.experiencePhase;
  if (state.rotationEndsAt) next[ROTATION_ENDS_AT_KEY] = state.rotationEndsAt;
  else delete next[ROTATION_ENDS_AT_KEY];
  return next;
}

export type RotationPatchInput = {
  experiencePhase?: unknown;
  rotationMinutes?: unknown;
};

/**
 * Apply a host rotation patch.
 * - { rotationMinutes } or { experiencePhase: "playing", rotationMinutes } starts a turn.
 * - { experiencePhase: "ended" } resets (clears the timer).
 */
export function applyRotationPatch(
  metadata: Record<string, unknown>,
  patch: RotationPatchInput,
  nowMs: number = Date.now(),
): { ok: true; metadata: Record<string, unknown> } | { ok: false; error: string } {
  const hasPhase = patch.experiencePhase !== undefined;
  const hasMinutes = patch.rotationMinutes !== undefined;

  if (!hasPhase && !hasMinutes) {
    return { ok: false, error: "Provide rotationMinutes and/or experiencePhase" };
  }

  let phase: ExperiencePhase | null = null;
  if (hasPhase) {
    phase = parseExperiencePhase(patch.experiencePhase);
    if (!phase) {
      return { ok: false, error: "experiencePhase must be 'playing' or 'ended'" };
    }
  }

  if (phase === "ended") {
    if (hasMinutes) {
      return { ok: false, error: "rotationMinutes cannot be combined with experiencePhase 'ended'" };
    }
    return {
      ok: true,
      metadata: writeSessionRotation(metadata, {
        experiencePhase: "ended",
        rotationEndsAt: null,
      }),
    };
  }

  if (!hasMinutes) {
    return { ok: false, error: "rotationMinutes is required to start a turn" };
  }
  const minutes = parseRotationMinutes(patch.rotationMinutes);
  if (!minutes) {
    return {
      ok: false,
      error: `rotationMinutes must be one of ${ROTATION_MINUTE_PRESETS.join(", ")}`,
    };
  }

  return {
    ok: true,
    metadata: writeSessionRotation(metadata, {
      experiencePhase: "playing",
      rotationEndsAt: new Date(nowMs + minutes * 60_000).toISOString(),
    }),
  };
}
