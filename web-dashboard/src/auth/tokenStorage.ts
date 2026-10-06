/** Host (Bluekey / local-dev) + kiosk token persistence helpers. */

import {
  EMAIL_STORAGE_KEY,
  KIOSK_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
} from "../auth/config";

const AUTH_EXPIRED_EVENT = "vellum-auth-expired";

export type HostTokenKind = "bluekey" | "local-dev" | null;

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeRemove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** JWT exp (seconds) → clear if past. local-dev never expires. */
export function isJwtExpired(token: string | null | undefined, nowSec = Date.now() / 1000): boolean {
  if (!token || token === "local-dev") return false;
  try {
    const parts = token.split(".");
    const payloadB64 = parts[1];
    if (!payloadB64) return false;
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp !== "number") return false;
    return payload.exp <= nowSec;
  } catch {
    return false;
  }
}

/** Read host token: localStorage primary, sessionStorage mirror (legacy). */
export function readHostToken(): string | null {
  const local = safeGet(localStorage, TOKEN_STORAGE_KEY);
  const session = safeGet(sessionStorage, TOKEN_STORAGE_KEY);
  const token = local || session;
  if (!token) return null;
  if (isJwtExpired(token)) {
    clearHostSession();
    return null;
  }
  // Heal mirror if only one store has it
  if (local && !session) safeSet(sessionStorage, TOKEN_STORAGE_KEY, local);
  if (session && !local) safeSet(localStorage, TOKEN_STORAGE_KEY, session);
  return token;
}

export function readHostEmail(): string {
  return (
    safeGet(localStorage, EMAIL_STORAGE_KEY) ??
    safeGet(sessionStorage, EMAIL_STORAGE_KEY) ??
    ""
  );
}

export function writeHostSession(token: string, email: string): void {
  safeSet(localStorage, TOKEN_STORAGE_KEY, token);
  safeSet(sessionStorage, TOKEN_STORAGE_KEY, token);
  safeSet(localStorage, EMAIL_STORAGE_KEY, email);
  safeSet(sessionStorage, EMAIL_STORAGE_KEY, email);
}

export function clearHostSession(): void {
  safeRemove(localStorage, TOKEN_STORAGE_KEY);
  safeRemove(sessionStorage, TOKEN_STORAGE_KEY);
  safeRemove(localStorage, EMAIL_STORAGE_KEY);
  safeRemove(sessionStorage, EMAIL_STORAGE_KEY);
}

export function readKioskToken(): string | null {
  const token = safeGet(sessionStorage, KIOSK_TOKEN_STORAGE_KEY);
  if (!token) return null;
  if (isJwtExpired(token)) {
    clearKioskToken();
    return null;
  }
  return token;
}

export function writeKioskToken(token: string): void {
  safeSet(sessionStorage, KIOSK_TOKEN_STORAGE_KEY, token);
}

export function clearKioskToken(): void {
  safeRemove(sessionStorage, KIOSK_TOKEN_STORAGE_KEY);
}

/**
 * Bearer for API calls: prefer host Bluekey/local token; on kiosk pages fall back to kiosk JWT.
 */
export function readBearerTokenForApi(): string | null {
  const host = readHostToken();
  if (host && host !== "local-dev") return host;
  const onKiosk =
    typeof window !== "undefined" &&
    (window.location.search.includes("kiosk=1") ||
      /\/kiosk\//i.test(window.location.pathname));
  if (onKiosk || !host) {
    const kiosk = readKioskToken();
    if (kiosk) return kiosk;
  }
  return host && host !== "local-dev" ? host : null;
}

export function notifyAuthExpired(message = "Session expired — sign in again."): void {
  try {
    sessionStorage.setItem("vellum_rift_auth_expired_msg", message);
  } catch {
    /* ignore */
  }
  clearHostSession();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { message } }));
}

export function consumeAuthExpiredMessage(): string | null {
  try {
    const msg = sessionStorage.getItem("vellum_rift_auth_expired_msg");
    if (msg) sessionStorage.removeItem("vellum_rift_auth_expired_msg");
    return msg;
  } catch {
    return null;
  }
}

export { AUTH_EXPIRED_EVENT };
