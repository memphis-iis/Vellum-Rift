import { API_BASE_URL } from "./config";
import { getAuthHeaders } from "./authHeaders";

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
  heightMode: string;
  width: number;
  height: number;
  vertexCount: number;
  fileSize: number;
  createdAt: string;
  ownerSub?: string | null;
  folderId?: string | null;
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

export function fetchFolder(folderId: string): Promise<FolderListing> {
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}`,
    { headers: getAuthHeaders() },
  ).then((res) => parseJson<FolderListing>(res));
}

export function createFolder(parentId: string, name: string): Promise<LibraryFolder> {
  return fetch(`${API_BASE_URL}/api/library/folders`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ parentId, name }),
  }).then((res) => parseJson<LibraryFolder>(res));
}

export function renameFolder(folderId: string, name: string): Promise<LibraryFolder> {
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
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  ).then((res) => parseJson<{ deleted: boolean }>(res));
}

export function fetchFolderShares(folderId: string): Promise<LibraryShare[]> {
  return fetch(
    `${API_BASE_URL}/api/library/folders/${encodeURIComponent(folderId)}/shares`,
    { headers: getAuthHeaders() },
  ).then((res) => parseJson<LibraryShare[]>(res));
}

export function addFolderShare(
  folderId: string,
  params: { email?: string; subjectSub?: string; role: LibraryShareRole },
): Promise<LibraryShare> {
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
): Promise<Array<{ folderId: string; label: string }>> {
  const options: Array<{ folderId: string; label: string }> = [];
  const queue: Array<{ folderId: string; path: string }> = [
    { folderId: rootFolderId, path: "Your library" },
  ];
  const seen = new Set<string>();

  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next.folderId)) continue;
    seen.add(next.folderId);
    options.push({ folderId: next.folderId, label: next.path });
    const listing = await fetchFolder(next.folderId);
    for (const folder of listing.folders) {
      const label = next.path === "Your library"
        ? folder.name
        : `${next.path} / ${folder.name}`;
      queue.push({ folderId: folder.folderId, path: label });
    }
  }

  return options;
}
