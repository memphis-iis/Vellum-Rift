import { API_BASE_URL } from "./config";
import { getAuthHeaders } from "./authHeaders";

export type DemoCatalogItem = {
  sessionId: string;
  modelId?: string;
  /** Human-readable title (not a raw filename). */
  label: string;
  category: string;
  summary: string;
  updatedAt: string;
  /** Absolute or path URL for public GLB preview. */
  previewUrl?: string;
};

/** Resolve a fetchable GLB URL for catalog <model-viewer>. */
export function demoPreviewUrl(demo: DemoCatalogItem): string | null {
  const modelId = demo.modelId?.trim();
  const path =
    demo.previewUrl?.trim() ||
    (modelId ? `/api/demos/${encodeURIComponent(modelId)}/glb` : "");
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export type DemoCatalogResponse = {
  demos: DemoCatalogItem[];
  categories: string[];
};

/** Public available-demo list (no auth). */
export async function fetchDemos(): Promise<DemoCatalogResponse> {
  const res = await fetch(`${API_BASE_URL}/api/demos`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      (body as { error?: string } | null)?.error ?? `Failed to load demos (${res.status})`,
    );
  }
  return res.json() as Promise<DemoCatalogResponse>;
}

export async function fetchDemoAdminStatus(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/demos/admin-status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { isAdmin?: boolean };
  return body.isAdmin === true;
}

export function groupDemosByCategory(
  demos: DemoCatalogItem[],
): { category: string; demos: DemoCatalogItem[] }[] {
  const map = new Map<string, DemoCatalogItem[]>();
  for (const demo of demos) {
    const list = map.get(demo.category) ?? [];
    list.push(demo);
    map.set(demo.category, list);
  }
  return [...map.entries()].map(([category, items]) => ({
    category,
    demos: items,
  }));
}

/** Guest / signed-in Try now → kiosk join URL for an exhibit Space. */
export function demoKioskHref(sessionId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  url.searchParams.set("kiosk", "1");
  url.searchParams.delete("demos");
  return url.toString();
}
