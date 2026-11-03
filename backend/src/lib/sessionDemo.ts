/**
 * Curated demo Spaces for Try now / Demos catalog.
 * Stored in game_sessions.metadata (no schema migration).
 */

import { readPlaylist } from "./sessionPlaylist.js";
import { readKioskEnabled, writeKioskEnabled } from "./sessionKiosk.js";

export const DEMO_ENABLED_KEY = "demoEnabled";
export const DEMO_CATEGORY_KEY = "demoCategory";
export const DEMO_SUMMARY_KEY = "demoSummary";

export const DEMO_CATEGORY_MAX = 64;
export const DEMO_SUMMARY_MAX = 280;
export const DEFAULT_DEMO_CATEGORY = "Examples";

export type SessionDemoState = {
  enabled: boolean;
  category: string;
  summary: string;
};

export function readSessionDemo(
  metadata: Record<string, unknown> | null | undefined,
): SessionDemoState {
  const enabled = metadata?.[DEMO_ENABLED_KEY] === true;
  const categoryRaw = metadata?.[DEMO_CATEGORY_KEY];
  const summaryRaw = metadata?.[DEMO_SUMMARY_KEY];
  const category =
    typeof categoryRaw === "string" && categoryRaw.trim()
      ? categoryRaw.trim().slice(0, DEMO_CATEGORY_MAX)
      : DEFAULT_DEMO_CATEGORY;
  const summary =
    typeof summaryRaw === "string" ? summaryRaw.trim().slice(0, DEMO_SUMMARY_MAX) : "";
  return { enabled, category, summary };
}

export function writeSessionDemo(
  metadata: Record<string, unknown>,
  state: SessionDemoState,
): Record<string, unknown> {
  const next = { ...metadata };
  if (!state.enabled) {
    delete next[DEMO_ENABLED_KEY];
    delete next[DEMO_CATEGORY_KEY];
    delete next[DEMO_SUMMARY_KEY];
    return next;
  }
  next[DEMO_ENABLED_KEY] = true;
  next[DEMO_CATEGORY_KEY] = state.category.trim().slice(0, DEMO_CATEGORY_MAX) || DEFAULT_DEMO_CATEGORY;
  const summary = state.summary.trim().slice(0, DEMO_SUMMARY_MAX);
  if (summary) next[DEMO_SUMMARY_KEY] = summary;
  else delete next[DEMO_SUMMARY_KEY];
  return next;
}

export type DemoPatchInput = {
  enabled?: unknown;
  category?: unknown;
  summary?: unknown;
};

/**
 * Apply a demo catalog patch. Enabling requires a non-empty playlist and
 * turns kiosk on so guests can Try now without Bluekey.
 */
export function applyDemoPatch(
  metadata: Record<string, unknown>,
  patch: DemoPatchInput,
): { ok: true; metadata: Record<string, unknown> } | { ok: false; error: string } {
  const current = readSessionDemo(metadata);

  if (patch.enabled === undefined && patch.category === undefined && patch.summary === undefined) {
    return { ok: false, error: "Provide enabled, category, and/or summary" };
  }

  let enabled = current.enabled;
  let category = current.category;
  let summary = current.summary;

  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== "boolean") {
      return { ok: false, error: "enabled must be a boolean" };
    }
    enabled = patch.enabled;
  }

  if (patch.category !== undefined) {
    if (patch.category !== null && typeof patch.category !== "string") {
      return { ok: false, error: "category must be a string" };
    }
    const raw = typeof patch.category === "string" ? patch.category.trim() : "";
    if (raw.length > DEMO_CATEGORY_MAX) {
      return { ok: false, error: `category must be at most ${DEMO_CATEGORY_MAX} characters` };
    }
    category = raw || DEFAULT_DEMO_CATEGORY;
  }

  if (patch.summary !== undefined) {
    if (patch.summary !== null && typeof patch.summary !== "string") {
      return { ok: false, error: "summary must be a string" };
    }
    const raw = typeof patch.summary === "string" ? patch.summary.trim() : "";
    if (raw.length > DEMO_SUMMARY_MAX) {
      return { ok: false, error: `summary must be at most ${DEMO_SUMMARY_MAX} characters` };
    }
    summary = raw;
  }

  if (enabled) {
    const { playlist } = readPlaylist(metadata);
    if (!playlist.length) {
      return {
        ok: false,
        error: "Add at least one manuscript to the playlist before publishing as a demo",
      };
    }
    category = category.trim() || DEFAULT_DEMO_CATEGORY;
    let next = writeSessionDemo(metadata, { enabled: true, category, summary });
    if (!readKioskEnabled(next)) {
      next = writeKioskEnabled(next, true);
    }
    return { ok: true, metadata: next };
  }

  return {
    ok: true,
    metadata: writeSessionDemo(metadata, { enabled: false, category, summary }),
  };
}
