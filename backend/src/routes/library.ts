/**
 * Private manuscript library API (#233–#235).
 * requireAuth only — kiosk guests never use Library.
 */

import { Router, type Request, type Response } from "express";
import { isKioskGuest } from "../lib/auth.js";
import {
  canEdit,
  canView,
  parseShareRole,
  resolveFolderAccess,
} from "../lib/libraryAccess.js";
import { LibraryRepository } from "../lib/libraryRepository.js";
import { GlTFModelRepository } from "../lib/gltfModelRepository.js";

const router = Router();
const libraryRepo = new LibraryRepository();
const modelRepo = new GlTFModelRepository();

const param = (req: Request, name: string): string => String(req.params[name]);

function rejectKiosk(req: Request, res: Response): boolean {
  if (isKioskGuest(req.user)) {
    res.status(403).json({ error: "Kiosk guests cannot access the manuscript library" });
    return true;
  }
  return false;
}

function requireUser(req: Request, res: Response): { sub: string; email: string } | null {
  const sub = req.user?.sub?.trim();
  if (!sub) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return { sub, email: req.user?.email ?? "" };
}

// GET /api/library — get-or-create my library
router.get("/", async (req: Request, res: Response) => {
  if (rejectKiosk(req, res)) return;
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const library = await libraryRepo.getOrCreateLibrary(user.sub, user.email);
    const [hasShares, sharedWithMe] = await Promise.all([
      libraryRepo.libraryHasShares(library.libraryId),
      libraryRepo.listFoldersSharedWith(user),
    ]);
    res.json({
      libraryId: library.libraryId,
      ownerSub: library.ownerSub,
      ownerEmail: library.ownerEmail,
      createdAt: library.createdAt,
      rootFolderId: library.rootFolderId,
      uploadsFolderId: library.uploadsFolderId,
      ownership: "owner" as const,
      badge: hasShares ? ("shared" as const) : ("only_you" as const),
      sharedWithMe: sharedWithMe.map((f) => ({
        folderId: f.folderId,
        name: f.isRoot ? "Your library" : f.name,
        role: f.role,
        ownerEmail: f.ownerEmail,
        libraryId: f.libraryId,
      })),
    });
  } catch (err) {
    console.error("GET /api/library failed:", err);
    res.status(500).json({ error: "Failed to load library" });
  }
});

// GET /api/library/folders/:folderId — list children + models + breadcrumbs
router.get("/folders/:folderId", async (req: Request, res: Response) => {
  if (rejectKiosk(req, res)) return;
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const folderId = param(req, "folderId");
    const access = await resolveFolderAccess(folderId, user);
    if (!access.folder || !canView(access.level)) {
      res.status(access.folder ? 403 : 404).json({
        error: access.folder ? "Forbidden" : "Folder not found",
      });
      return;
    }

    const [folders, models, breadcrumbs] = await Promise.all([
      libraryRepo.listChildFolders(folderId),
      modelRepo.findByFolder(folderId),
      libraryRepo.listAncestors(folderId),
    ]);

    res.json({
      folder: access.folder,
      access: access.level,
      folders,
      models,
      breadcrumbs: breadcrumbs.map((f) => ({
        folderId: f.folderId,
        name: f.isRoot ? "Your library" : f.name,
        isRoot: f.isRoot,
      })),
    });
  } catch (err) {
    console.error("GET /api/library/folders/:folderId failed:", err);
    res.status(500).json({ error: "Failed to list folder" });
  }
});

// POST /api/library/folders — create folder
router.post("/folders", async (req: Request, res: Response) => {
  if (rejectKiosk(req, res)) return;
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const parentId = String((req.body as { parentId?: string }).parentId ?? "").trim();
    const name = String((req.body as { name?: string }).name ?? "").trim();
    if (!parentId) {
      res.status(400).json({ error: "parentId is required" });
      return;
    }
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const access = await resolveFolderAccess(parentId, user);
    if (!access.folder || !canEdit(access.level)) {
      res.status(access.folder ? 403 : 404).json({
        error: access.folder ? "Forbidden" : "Parent folder not found",
      });
      return;
    }

    const folder = await libraryRepo.createFolder({
      libraryId: access.folder.libraryId,
      parentId,
      name,
    });
    res.status(201).json(folder);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "A folder with that name already exists here" });
      return;
    }
    console.error("POST /api/library/folders failed:", err);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

// PATCH /api/library/folders/:folderId — rename
router.patch("/folders/:folderId", async (req: Request, res: Response) => {
  if (rejectKiosk(req, res)) return;
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const folderId = param(req, "folderId");
    const name = String((req.body as { name?: string }).name ?? "").trim();
    const access = await resolveFolderAccess(folderId, user);
    if (!access.folder || !canEdit(access.level)) {
      res.status(access.folder ? 403 : 404).json({
        error: access.folder ? "Forbidden" : "Folder not found",
      });
      return;
    }
    if (access.folder.isRoot) {
      res.status(400).json({ error: "Cannot rename the library root" });
      return;
    }
    if (access.folder.isSystem) {
      res.status(400).json({ error: "Cannot rename system folders" });
      return;
    }
    const updated = await libraryRepo.renameFolder(folderId, name);
    if (!updated) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "A folder with that name already exists here" });
      return;
    }
    console.error("PATCH /api/library/folders/:folderId failed:", err);
    res.status(500).json({ error: "Failed to rename folder" });
  }
});

// DELETE /api/library/folders/:folderId — empty only
router.delete("/folders/:folderId", async (req: Request, res: Response) => {
  if (rejectKiosk(req, res)) return;
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const folderId = param(req, "folderId");
    const access = await resolveFolderAccess(folderId, user);
    if (!access.folder || !canEdit(access.level)) {
      res.status(access.folder ? 403 : 404).json({
        error: access.folder ? "Forbidden" : "Folder not found",
      });
      return;
    }
    if (access.folder.isRoot || access.folder.isSystem) {
      res.status(400).json({ error: "Cannot delete this folder" });
      return;
    }
    const counts = await libraryRepo.countChildren(folderId);
    if (counts.folders > 0 || counts.models > 0) {
      res.status(409).json({
        error: "Folder is not empty. Move or delete its contents first.",
        counts,
      });
      return;
    }
    const ok = await libraryRepo.deleteFolderIfEmpty(folderId);
    if (!ok) {
      res.status(409).json({ error: "Could not delete folder" });
      return;
    }
    res.json({ deleted: true, folderId });
  } catch (err) {
    console.error("DELETE /api/library/folders/:folderId failed:", err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

// GET /api/library/folders/:folderId/shares
router.get("/folders/:folderId/shares", async (req: Request, res: Response) => {
  if (rejectKiosk(req, res)) return;
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const folderId = param(req, "folderId");
    const access = await resolveFolderAccess(folderId, user);
    if (!access.folder || !canEdit(access.level)) {
      res.status(access.folder ? 403 : 404).json({
        error: access.folder ? "Forbidden" : "Folder not found",
      });
      return;
    }
    const shares = await libraryRepo.listShares(folderId);
    res.json(shares);
  } catch (err) {
    console.error("GET /api/library/folders/:folderId/shares failed:", err);
    res.status(500).json({ error: "Failed to list shares" });
  }
});

// POST /api/library/folders/:folderId/shares
router.post("/folders/:folderId/shares", async (req: Request, res: Response) => {
  if (rejectKiosk(req, res)) return;
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const folderId = param(req, "folderId");
    const access = await resolveFolderAccess(folderId, user);
    if (!access.folder || !canEdit(access.level)) {
      res.status(access.folder ? 403 : 404).json({
        error: access.folder ? "Forbidden" : "Folder not found",
      });
      return;
    }
    const body = req.body as {
      email?: string;
      subjectSub?: string;
      role?: string;
    };
    const role = parseShareRole(body.role ?? "view");
    if (!role) {
      res.status(400).json({ error: "role must be 'view' or 'edit'" });
      return;
    }
    const share = await libraryRepo.addShare({
      folderId,
      email: body.email,
      subjectSub: body.subjectSub,
      role,
      addedBySub: user.sub,
      addedByEmail: user.email,
    });
    res.status(201).json(share);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("email or subjectSub")) {
      res.status(400).json({ error: msg });
      return;
    }
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "Already shared with that person" });
      return;
    }
    console.error("POST /api/library/folders/:folderId/shares failed:", err);
    res.status(500).json({ error: "Failed to add share" });
  }
});

// DELETE /api/library/folders/:folderId/shares/:shareId
router.delete("/folders/:folderId/shares/:shareId", async (req: Request, res: Response) => {
  if (rejectKiosk(req, res)) return;
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const folderId = param(req, "folderId");
    const shareId = param(req, "shareId");
    const access = await resolveFolderAccess(folderId, user);
    if (!access.folder || !canEdit(access.level)) {
      res.status(access.folder ? 403 : 404).json({
        error: access.folder ? "Forbidden" : "Folder not found",
      });
      return;
    }
    const ok = await libraryRepo.deleteShare(folderId, shareId);
    if (!ok) {
      res.status(404).json({ error: "Share not found" });
      return;
    }
    res.json({ deleted: true, shareId });
  } catch (err) {
    console.error("DELETE /api/library/folders/:folderId/shares/:shareId failed:", err);
    res.status(500).json({ error: "Failed to revoke share" });
  }
});

export default router;
