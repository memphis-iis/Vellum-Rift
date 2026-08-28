import { API_BASE_URL } from "./config";

export type KioskStatus = {
  sessionId: string;
  label?: string;
  isActive?: boolean;
  kioskEnabled: boolean;
  error?: string;
};

export type KioskTokenResponse = {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  expiresIn: number;
  sessionId: string;
  displayNameHint: string;
};

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`,
    );
  }
  return body as T;
}

export function fetchKioskStatus(sessionId: string): Promise<KioskStatus> {
  return publicRequest<KioskStatus>(
    `/api/kiosk/${encodeURIComponent(sessionId)}/status`,
  );
}

export function mintKioskToken(sessionId: string): Promise<KioskTokenResponse> {
  return publicRequest<KioskTokenResponse>(
    `/api/kiosk/${encodeURIComponent(sessionId)}/token`,
    { method: "POST", body: "{}" },
  );
}
