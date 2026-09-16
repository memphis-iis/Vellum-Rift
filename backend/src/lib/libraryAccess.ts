/**
 * Library folder ACL (#233): owner or share on folder / ancestor.
 */

import type { AuthenticatedUser } from "./auth.js";
import {
  LibraryRepository,
  type LibraryFolder,
  type LibraryShareRole,
} from "./libraryRepository.js";
import { normalizeEmail } from "./sessionAccess.js";

const repo = new LibraryRepository();

export type LibraryAccessLevel = "none" | "view" | "edit";

export async function resolveFolderAccess(
  folderId: string,
  user: Pick<AuthenticatedUser, "sub" | "email"> | undefined,
): Promise<{ level: LibraryAccessLevel; folder: LibraryFolder | null }> {
  const folder = await repo.findFolderById(folderId);
  if (!folder) return { level: "none", folder: null };
  if (!user?.sub) return { level: "none", folder };

  const library = await repo.findLibraryById(folder.libraryId);
  if (!library) return { level: "none", folder };

  if (library.ownerSub === user.sub) {
    return { level: "edit", folder };
  }
  const email = normalizeEmail(user.email);
  if (email && normalizeEmail(library.ownerEmail) === email) {
    return { level: "edit", folder };
  }

  const shares = await repo.listApplicableShares(folderId, {
    sub: user.sub,
    email: user.email,
  });
  if (shares.some((s) => s.role === "edit")) {
    return { level: "edit", folder };
  }
  if (shares.length > 0) {
    return { level: "view", folder };
  }
  return { level: "none", folder };
}

export function canView(level: LibraryAccessLevel): boolean {
  return level === "view" || level === "edit";
}

export function canEdit(level: LibraryAccessLevel): boolean {
  return level === "edit";
}

export function parseShareRole(raw: unknown): LibraryShareRole | null {
  if (raw === "view" || raw === "edit") return raw;
  return null;
}
