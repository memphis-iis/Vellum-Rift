/**
 * Platform Demos library + available Try now catalog.
 */

import pool from "./db.js";
import { GameStateRepository } from "./gameStateRepository.js";
import {
  GlTFModelRepository,
  type GlTFModelRecord,
} from "./gltfModelRepository.js";
import { LibraryRepository, type LibraryFolder } from "./libraryRepository.js";
import { writeKioskEnabled } from "./sessionKiosk.js";
import { writePlaylist } from "./sessionPlaylist.js";
import { writeExhibitFlags, readExhibitModelId } from "./sessionExhibit.js";

export const PLATFORM_DEMOS_OWNER_SUB = "acct:vellum-demos";
export const PLATFORM_DEMOS_OWNER_EMAIL = "demos@vellum.rift";
export const DEMOS_FOLDER_NAME = "Demos";

const libraryRepo = new LibraryRepository();
const modelRepo = new GlTFModelRepository();
const gameRepo = new GameStateRepository();

export type PlatformDemosLibrary = {
  libraryId: string;
  rootFolderId: string;
  demosFolderId: string;
};

export type AvailableDemo = {
  sessionId: string;
  modelId: string;
  /** Human-readable title for catalog cards (not a raw filename). */
  label: string;
  category: string;
  summary: string;
  updatedAt: string;
};

/** Turn stored labels like `Foo_Bar_-_Baz` into a readable title. */
export function formatDemoDisplayName(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "Untitled demo";
  return trimmed.replace(/_/g, " ").replace(/\s+/g, " ").trim() || "Untitled demo";
}

/** True when a model may be publicly previewed / listed as a Try now demo. */
export async function isPublicDemoModel(
  modelId: string,
): Promise<{ ok: true; model: GlTFModelRecord } | { ok: false }> {
  const model = await modelRepo.findById(modelId);
  if (!model?.tryNowEnabled) return { ok: false };
  if (!GlTFModelRepository.isReadyFor3d(model)) return { ok: false };
  if (!(await isUnderDemosFolder(model.folderId))) return { ok: false };
  return { ok: true, model };
}

export async function getOrCreatePlatformDemosLibrary(): Promise<PlatformDemosLibrary> {
  const library = await libraryRepo.getOrCreateLibrary(
    PLATFORM_DEMOS_OWNER_SUB,
    PLATFORM_DEMOS_OWNER_EMAIL,
  );

  let demos = await findDemosFolder(library.libraryId, library.rootFolderId);
  if (!demos) {
    demos = await libraryRepo.createFolder({
      libraryId: library.libraryId,
      parentId: library.rootFolderId,
      name: DEMOS_FOLDER_NAME,
      isSystem: true,
    });
  }

  return {
    libraryId: library.libraryId,
    rootFolderId: library.rootFolderId,
    demosFolderId: demos.folderId,
  };
}

async function findDemosFolder(
  libraryId: string,
  rootFolderId: string,
): Promise<LibraryFolder | null> {
  const children = await libraryRepo.listChildFolders(rootFolderId);
  const hit = children.find(
    (f) => f.isSystem && f.name.trim().toLowerCase() === DEMOS_FOLDER_NAME.toLowerCase(),
  );
  if (hit) return hit;

  const { rows } = await pool.query(
    `SELECT * FROM library_folders
     WHERE library_id = $1 AND is_system = true AND is_root = false
       AND lower(name) = lower($2)
     LIMIT 1`,
    [libraryId, DEMOS_FOLDER_NAME],
  );
  if (!rows[0]) return null;
  return {
    folderId: String(rows[0].folder_id),
    libraryId: String(rows[0].library_id),
    parentId: rows[0].parent_id ? String(rows[0].parent_id) : null,
    name: String(rows[0].name ?? ""),
    isRoot: Boolean(rows[0].is_root),
    isSystem: Boolean(rows[0].is_system),
    createdAt: new Date(String(rows[0].created_at)).toISOString(),
    updatedAt: new Date(String(rows[0].updated_at)).toISOString(),
  };
}

/** True when folder is the Demos folder or a descendant. */
export async function isUnderDemosFolder(folderId: string | null | undefined): Promise<boolean> {
  if (!folderId) return false;
  const platform = await getOrCreatePlatformDemosLibrary();
  let current: string | null = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === platform.demosFolderId) return true;
    seen.add(current);
    const folder = await libraryRepo.findFolderById(current);
    if (!folder || folder.libraryId !== platform.libraryId) return false;
    current = folder.parentId;
  }
  return false;
}

export async function categoryForModelFolder(folderId: string | null): Promise<string> {
  if (!folderId) return "Examples";
  const platform = await getOrCreatePlatformDemosLibrary();
  const folder = await libraryRepo.findFolderById(folderId);
  if (!folder) return "Examples";
  if (folder.folderId === platform.demosFolderId) return "Examples";
  const name = folder.name?.trim();
  return name || "Examples";
}

/**
 * Create or refresh the read-only kiosk exhibit Space for a demo model.
 */
export async function ensureExhibitSpace(model: GlTFModelRecord): Promise<string> {
  const label = model.label?.trim() || "Demo exhibit";
  let state = model.exhibitSessionId
    ? await gameRepo.findById(model.exhibitSessionId)
    : null;

  if (!state) {
    state = await gameRepo.create(label, {
      visibility: "public",
      createdBySub: PLATFORM_DEMOS_OWNER_SUB,
      createdByEmail: PLATFORM_DEMOS_OWNER_EMAIL,
    });
  }

  let metadata = { ...state.metadata };
  metadata = writePlaylist(metadata, {
    playlist: [model.modelId],
    activeModelId: model.modelId,
  });
  metadata = writeKioskEnabled(metadata, true);
  metadata = writeExhibitFlags(metadata, model.modelId);
  state.metadata = metadata;
  state.label = label;
  state.isActive = true;
  state.updatedAt = new Date().toISOString();
  await gameRepo.save(state);
  await modelRepo.syncSessionPlaylist(state.sessionId, [model.modelId]);
  return state.sessionId;
}

export async function setModelTryNow(
  modelId: string,
  enabled: boolean,
): Promise<GlTFModelRecord> {
  const model = await modelRepo.findById(modelId);
  if (!model) throw Object.assign(new Error("Model not found"), { status: 404 });
  if (!(await isUnderDemosFolder(model.folderId))) {
    throw Object.assign(new Error("Model must be in the Demos library folder"), {
      status: 400,
    });
  }

  if (!enabled) {
    const updated = await modelRepo.setTryNow(modelId, false);
    if (!updated) throw Object.assign(new Error("Model not found"), { status: 404 });
    if (updated.exhibitSessionId) {
      const state = await gameRepo.findById(updated.exhibitSessionId);
      if (state) {
        state.metadata = writeKioskEnabled(state.metadata, false);
        state.updatedAt = new Date().toISOString();
        await gameRepo.save(state);
      }
    }
    return updated;
  }

  if (!GlTFModelRepository.isReadyFor3d(model)) {
    throw Object.assign(
      new Error("Manuscript is not ready for 3D yet; it won't appear in Try now"),
      { status: 400 },
    );
  }

  const sessionId = await ensureExhibitSpace(model);
  const updated = await modelRepo.setTryNow(modelId, true, sessionId);
  if (!updated) throw Object.assign(new Error("Model not found"), { status: 404 });
  return updated;
}

/** Public catalog: enabled + ready + under Demos + exhibit joinable. */
export async function listAvailableDemos(): Promise<AvailableDemo[]> {
  await getOrCreatePlatformDemosLibrary();
  const enabled = await modelRepo.listTryNowEnabled();
  const demos: AvailableDemo[] = [];

  for (const model of enabled) {
    if (!GlTFModelRepository.isReadyFor3d(model)) continue;
    if (!(await isUnderDemosFolder(model.folderId))) continue;

    let sessionId = model.exhibitSessionId;
    if (!sessionId) {
      try {
        sessionId = await ensureExhibitSpace(model);
        await modelRepo.setTryNow(model.modelId, true, sessionId);
      } catch {
        continue;
      }
    } else {
      const state = await gameRepo.findById(sessionId);
      if (!state?.isActive) {
        try {
          sessionId = await ensureExhibitSpace(model);
          await modelRepo.setTryNow(model.modelId, true, sessionId);
        } catch {
          continue;
        }
      }
    }

    const category = await categoryForModelFolder(model.folderId);
    demos.push({
      sessionId,
      modelId: model.modelId,
      label: formatDemoDisplayName(model.label),
      category,
      summary: "",
      updatedAt: model.createdAt,
    });
  }

  demos.sort((a, b) => {
    const cat = a.category.localeCompare(b.category, undefined, { sensitivity: "base" });
    if (cat !== 0) return cat;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
  return demos;
}

/** Kiosk mint gate for exhibit Spaces. */
export async function exhibitAllowsKioskJoin(sessionId: string): Promise<boolean> {
  const state = await gameRepo.findById(sessionId);
  if (!state?.isActive) return false;
  const modelId = readExhibitModelId(state.metadata);
  if (!modelId) {
    // Non-exhibit kiosk spaces unchanged.
    return true;
  }
  const model = await modelRepo.findById(modelId);
  if (!model?.tryNowEnabled) return false;
  if (!GlTFModelRepository.isReadyFor3d(model)) return false;
  if (!(await isUnderDemosFolder(model.folderId))) return false;
  return true;
}
