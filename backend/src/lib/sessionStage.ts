/**
 * Kiosk stage layout + guest experience (#243).
 * Stored in session metadata; presets seed modelPlacements.
 */

import {
  type ModelPlacement,
  defaultPlacement,
  readModelPlacements,
  writeModelPlacements,
} from "./sessionModelPlacements.js";
import { readPlaylist } from "./sessionPlaylist.js";

export const STAGE_LAYOUT_KEY = "stageLayout";
export const GUEST_EXPERIENCE_KEY = "guestExperience";

export type StageLayout = "spotlight" | "even_row" | "surround" | "custom";
export type GuestExperience = "host_led" | "browse" | "open_stage";

export type SessionStageState = {
  stageLayout: StageLayout;
  guestExperience: GuestExperience;
};

const LAYOUTS = new Set<StageLayout>(["spotlight", "even_row", "surround", "custom"]);
const EXPERIENCES = new Set<GuestExperience>(["host_led", "browse", "open_stage"]);

export function readStage(metadata: Record<string, unknown> | null | undefined): SessionStageState {
  const layoutRaw = metadata?.[STAGE_LAYOUT_KEY];
  const expRaw = metadata?.[GUEST_EXPERIENCE_KEY];
  const stageLayout =
    typeof layoutRaw === "string" && LAYOUTS.has(layoutRaw as StageLayout)
      ? (layoutRaw as StageLayout)
      : "surround";
  const guestExperience =
    typeof expRaw === "string" && EXPERIENCES.has(expRaw as GuestExperience)
      ? (expRaw as GuestExperience)
      : "open_stage";
  return { stageLayout, guestExperience };
}

export function writeStage(
  metadata: Record<string, unknown>,
  state: SessionStageState,
): Record<string, unknown> {
  return {
    ...metadata,
    [STAGE_LAYOUT_KEY]: state.stageLayout,
    [GUEST_EXPERIENCE_KEY]: state.guestExperience,
  };
}

export function guestsMaySwitch(experience: GuestExperience): boolean {
  return experience === "browse" || experience === "open_stage";
}

/** Deterministic placements for a playlist under a named preset. */
export function seedPlacementsForLayout(
  playlist: string[],
  layout: StageLayout,
): Record<string, ModelPlacement> {
  const out: Record<string, ModelPlacement> = {};
  const n = playlist.length;
  if (n === 0) return out;

  if (layout === "spotlight" || layout === "custom") {
    for (const id of playlist) out[id] = defaultPlacement();
    return out;
  }

  if (layout === "even_row") {
    const spacing = 2.5;
    const start = -((n - 1) * spacing) / 2;
    playlist.forEach((id, i) => {
      out[id] = {
        position: [start + i * spacing, 0.5, 0],
        rotation: [0, 0, 0],
        scale: 1,
      };
    });
    return out;
  }

  // surround — ring around origin
  const radius = Math.max(3, n * 0.9);
  playlist.forEach((id, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const yawDeg = (Math.atan2(-x, -z) * 180) / Math.PI;
    out[id] = {
      position: [x, 0.5, z],
      rotation: [0, yawDeg, 0],
      scale: 1,
    };
  });
  return out;
}

export type StagePatchResult =
  | { ok: true; metadata: Record<string, unknown> }
  | { ok: false; error: string; statusCode: number };

/** Host patch: layout and/or guestExperience; non-custom layout reseeds placements. */
export function applyStagePatch(
  metadata: Record<string, unknown>,
  body: { stageLayout?: unknown; guestExperience?: unknown },
): StagePatchResult {
  const current = readStage(metadata);
  let stageLayout = current.stageLayout;
  let guestExperience = current.guestExperience;

  if (body.stageLayout !== undefined) {
    if (typeof body.stageLayout !== "string" || !LAYOUTS.has(body.stageLayout as StageLayout)) {
      return {
        ok: false,
        error: "stageLayout must be spotlight|even_row|surround|custom",
        statusCode: 400,
      };
    }
    stageLayout = body.stageLayout as StageLayout;
  }

  if (body.guestExperience !== undefined) {
    if (
      typeof body.guestExperience !== "string" ||
      !EXPERIENCES.has(body.guestExperience as GuestExperience)
    ) {
      return {
        ok: false,
        error: "guestExperience must be host_led|browse|open_stage",
        statusCode: 400,
      };
    }
    guestExperience = body.guestExperience as GuestExperience;
  }

  let next = writeStage(metadata, { stageLayout, guestExperience });
  const { playlist } = readPlaylist(next);

  if (stageLayout !== "custom" && body.stageLayout !== undefined) {
    const seeds = seedPlacementsForLayout(playlist, stageLayout);
    const placements = readModelPlacements(next, playlist);
    next = writeModelPlacements(next, {
      selectedModelId: placements.selectedModelId,
      modelPlacements: seeds,
    });
  }

  return { ok: true, metadata: next };
}
