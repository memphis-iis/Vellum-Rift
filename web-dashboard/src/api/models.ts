import { API_BASE_URL } from "./config";
import { TOKEN_STORAGE_KEY } from "../auth/config";

function authHeaders(json = false): Headers {
  const headers = new Headers();
  try {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (token && token !== "local-dev") {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    /* ignore */
  }
  if (json) headers.set("Content-Type", "application/json");
  return headers;
}

export type ModelMeta = {
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
};

export async function fetchModelMeta(modelId: string): Promise<ModelMeta> {
  const res = await fetch(`${API_BASE_URL}/api/models/${encodeURIComponent(modelId)}/meta`, {
    headers: authHeaders(true),
  });
  const data = (await res.json().catch(() => ({}))) as ModelMeta & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Model metadata failed (${res.status})`);
  }
  return data;
}

/**
 * Download GLB via authenticated fetch and return a blob: URL for <model-viewer>.
 * Caller must revoke with URL.revokeObjectURL when done.
 */
export async function fetchModelGlbObjectUrl(modelId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/models/${encodeURIComponent(modelId)}`, {
    headers: authHeaders(false),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Model download failed (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
