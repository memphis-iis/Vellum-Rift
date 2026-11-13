import { API_BASE_URL } from "./config";
import { getAuthHeaders } from "./authHeaders";
import { assertId } from "../lib/assert";

export type LibraryShareRole = "view" | "edit";

export type LibrarySummary = {
  libraryId: string;
  ownerSub: string;
  ownerEmail: string;
  createdAt: string;
  rootFolderId: string;
  uploadsFolderId: string;
  ownership: "owner";
  badge: "only_you" | "shared";
  sharedWithMe: Array<{
    folderId: string;
    name: string;
    role: LibraryShareRole;
    ownerEmail: string;
    libraryId: string;
  }>;
  /** Present for DEMO_ADMIN_EMAILS: platform Demos folder entry. */
  demos?: { folderId: string; libraryId: string } | null;
  isDemoAdmin?: boolean;
};

export type LibraryFolder = {
  folderId: string;
  libraryId: string;
  parentId: string | null;
  name: string;
  isRoot: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LibraryModel = {
  modelId: string;
  sessionId?: string | null;
  label: string;
  storageKey?: string;
  heightMode: string;
  width: number;
  height: number;
  vertexCount: number;
  fileSize: number;
  createdAt: string;
  ownerSub?: string | null;
  folderId?: string | null;
  tryNowEnabled?: boolean;
  exhibitSessionId?: string | null;
};

export type FolderListing = {
  folder: LibraryFolder;
  access: "view" | "edit";
  folders: LibraryFolder[];
  models: LibraryModel[];
  breadcrumbs: Array<{ folderId: string; name: string; isRoot: boolean }>;
};

export type LibraryShare = {
  id: string;
  folderId: string;
  subjectSub: string | null;
  email: string | null;
  role: LibraryShareRole;
  addedBySub: string | null;
  addedByEmail: string | null;
  createdAt: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`,
    );
  }
  return data;
}

export function fetchLibrary(): Promise<LibrarySummary> {
  return fetch(`${API_BASE_URL}/api/library`, {
    headers: getAuthHeaders(),
  }).then((res) => parseJson<LibrarySummary>(res));
}

export function patchModelTryNow(
  modelId: string,
  enabled: boolean,
): Promise<{
  modelId: string;
  tryNowEnabled: boolean;
  exhibitSessionId: string | null;
  readyFor3d: boolean;
}> {
  return fetch(
    `${API_BASE_URL}/api/library/models/${encodeURIComponent(modelId)}/try-now`,
    {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled }),
    },
  ).then((res) =>
    parseJson<{
      modelId: string;
      tryNowEnabled: boolean;
      exhibitSessionId: string | null;
      readyFor3d: boolean;
    }>(res),
  );
}

export function fetchFolder(folderId: string): Promise<FolderListing> {
  assertId(folderId, "folderId");
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}`,
    { headers: getAuthHeaders() },
  ).then((res) => parseJson<FolderListing>(res));
}

export function createFolder(parentId: string, name: string): Promise<LibraryFolder> {
  assertId(parentId, "parentId");
  return fetch(`${API_BASE_URL}/api/library/folders`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ parentId, name }),
  }).then((res) => parseJson<LibraryFolder>(res));
}

export function renameFolder(folderId: string, name: string): Promise<LibraryFolder> {
  assertId(folderId, "folderId");
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}`,
    {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name }),
    },
  ).then((res) => parseJson<LibraryFolder>(res));
}

export function deleteFolder(folderId: string): Promise<{ deleted: boolean }> {
  assertId(folderId, "folderId");
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  ).then((res) => parseJson<{ deleted: boolean }>(res));
}

export function fetchFolderShares(folderId: string): Promise<LibraryShare[]> {
  assertId(folderId, "folderId");
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}/shares`,
    { headers: getAuthHeaders() },
  ).then((res) => parseJson<LibraryShare[]>(res));
}

export function addFolderShare(
  folderId: string,
  params: { email?: string; subjectSub?: string; role: LibraryShareRole },
): Promise<LibraryShare> {
  assertId(folderId, "folderId");
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}/shares`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    },
  ).then((res) => parseJson<LibraryShare>(res));
}

export function revokeFolderShare(
  folderId: string,
  shareId: string,
): Promise<{ deleted: boolean }> {
  assertId(folderId, "folderId");
  assertId(shareId, "shareId");
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}/shares/${encodeURIComponent(shareId)}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  ).then((res) => parseJson<{ deleted: boolean }>(res));
}

/** Flat folder options with path labels for pickers (BFS from root). */
export async function listFolderOptions(
  rootFolderId: string,
  rootLabel = "Your library",
): Promise<Array<{ folderId: string; label: string }>> {
  assertId(rootFolderId, "rootFolderId");
  const options: Array<{ folderId: string; label: string }> = [];
  const queue: Array<{ folderId: string; path: string }> = [
    { folderId: rootFolderId, path: rootLabel },
  ];
  const seen = new Set<string>();

  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next.folderId)) continue;
    seen.add(next.folderId);
    options.push({ folderId: next.folderId, label: next.path });
    try {
      const listing = await fetchFolder(next.folderId);
      for (const folder of listing.folders) {
        const label =
          next.path === rootLabel
            ? folder.name
            : `${next.path} / ${folder.name}`;
        queue.push({ folderId: folder.folderId, path: label });
      }
    } catch {
      // Keep the parent option even if children fail to load.
    }
  }

  return options;
}

/**
 * Upload destination picker: personal library (+ Demos for demo admins,
 * + shared editable folders).
 */
export async function listUploadFolderOptions(): Promise<{
  options: Array<{ folderId: string; label: string }>;
  defaultFolderId: string;
}> {
  const library = await fetchLibrary();
  const byId = new Map<string, string>();

  const addAll = async (rootId: string, rootLabel: string) => {
    const list = await listFolderOptions(rootId, rootLabel);
    for (const opt of list) {
      if (!byId.has(opt.folderId)) byId.set(opt.folderId, opt.label);
    }
  };

  await addAll(library.rootFolderId, "Your library");

  if (library.demos?.folderId) {
    await addAll(library.demos.folderId, "Demos");
  }

  for (const shared of library.sharedWithMe ?? []) {
    if (shared.role !== "edit") continue;
    await addAll(shared.folderId, `Shared / ${shared.name}`);
  }

  // Ensure Uploads is present even if BFS missed it.
  if (library.uploadsFolderId && !byId.has(library.uploadsFolderId)) {
    byId.set(library.uploadsFolderId, "Uploads");
  }

  const options = [...byId.entries()].map(([folderId, label]) => ({
    folderId,
    label,
  }));
  options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  return {
    options,
    defaultFolderId: library.uploadsFolderId,
  };
}
