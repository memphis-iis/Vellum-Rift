import { API_BASE_URL } from "./config";
import { getAuthHeaders } from "./authHeaders";

export type DemoCatalogItem = {
  sessionId: string;
  label: string;
  category: string;
  summary: string;
  activeModelId: string | null;
  playlistCount: number;
  updatedAt: string;
};

export type DemoCatalogResponse = {
  demos: DemoCatalogItem[];
  categories: string[];
};

/** Public curated demo list (no auth). */
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

export async function patchSessionDemo(
  sessionId: string,
  body: { enabled?: boolean; category?: string; summary?: string },
): Promise<unknown> {
  const res = await fetch(
    `${API_BASE_URL}/api/game-state/${encodeURIComponent(sessionId)}/demo`,
    {
      method: "PATCH",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      (errBody as { error?: string } | null)?.error ?? `Demo update failed (${res.status})`,
    );
  }
  return res.json();
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

/** Guest Try now → kiosk join URL for a curated Space. */
export function demoKioskHref(sessionId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  url.searchParams.set("kiosk", "1");
  url.searchParams.delete("demos");
  return url.toString();
}
