/**
 * Attach Bluekey Bearer token when present (local-dev skip has no token).
 */
import { EMAIL_STORAGE_KEY, TOKEN_STORAGE_KEY } from "../auth/config";

export function getAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  try {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (token && token !== "local-dev") {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    /* ignore */
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

export function getStoredEmail(): string {
  try {
    return sessionStorage.getItem(EMAIL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
