/**
 * Attach Bluekey Bearer token when present (local-dev skip has no token).
 * Prefers host localStorage token; kiosk JWT only on kiosk routes.
 */
import { EMAIL_STORAGE_KEY } from "../auth/config";
import { readBearerTokenForApi, readHostEmail } from "../auth/tokenStorage";

export function getAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  try {
    const token = readBearerTokenForApi();
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
  return readHostEmail() || (() => {
    try {
      return sessionStorage.getItem(EMAIL_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  })();
}
