import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_REQUIRED,
  BLUEKEY_ORIGIN,
  BLUEKEY_PORTAL_URL,
  BLUEKEY_SOFTWARE_ID,
} from "./config";
import {
  AUTH_EXPIRED_EVENT,
  clearHostSession,
  consumeAuthExpiredMessage,
  readHostEmail,
  readHostToken,
  writeHostSession,
} from "./tokenStorage";

export type AuthUser = {
  email: string;
  /** Present when signed in via Bluekey */
  accessToken: string | null;
  /** Local-dev bypass without Bluekey */
  isLocalDev: boolean;
  /** Bluekey JWT `sub` when decodeable from the access token */
  sub?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  openPopup: () => void;
  continueInThisTab: () => void;
  continueAsLocalDev: () => void;
  logout: () => void;
  getAccessToken: () => string | null;
  authRequired: boolean;
  softwareIdConfigured: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCEPTED_MESSAGE_TYPES = new Set([
  "bluekey-login-success",
  "bluekey-auth-success",
  "login-success",
  "auth-success",
]);

/** Best-effort JWT payload decode (no signature verify — UI identity only). */
function subFromAccessToken(token: string | null | undefined): string | null {
  if (!token || token === "local-dev") return null;
  try {
    const parts = token.split(".");
    const payloadB64 = parts[1];
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

function readStoredUser(): AuthUser | null {
  const token = readHostToken();
  const email = readHostEmail();
  if (token === "local-dev") {
    return { email: email || "dev@memphis.edu", accessToken: null, isLocalDev: true, sub: null };
  }
  if (token) {
    return {
      email,
      accessToken: token,
      isLocalDev: false,
      sub: subFromAccessToken(token),
    };
  }
  return null;
}

function persistUser(user: AuthUser | null): void {
  if (!user) {
    clearHostSession();
    return;
  }
  if (user.isLocalDev) {
    writeHostSession("local-dev", user.email);
    return;
  }
  if (user.accessToken) {
    writeHostSession(user.accessToken, user.email);
  }
}

function extractToken(data: Record<string, unknown>): string | null {
  const nested =
    data.data && typeof data.data === "object"
      ? (data.data as Record<string, unknown>)
      : null;
  const candidates = [data.accessToken, data.token, nested?.accessToken, nested?.token];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function extractEmail(data: Record<string, unknown>): string {
  if (typeof data.email === "string" && data.email) return data.email;
  const nested =
    data.data && typeof data.data === "object"
      ? (data.data as Record<string, unknown>)
      : null;
  if (nested && typeof nested.email === "string") return nested.email;
  return "";
}

function buildBluekeyUrl(mode: "popup"): string {
  const url = new URL(BLUEKEY_PORTAL_URL);
  if (BLUEKEY_SOFTWARE_ID) {
    url.searchParams.set("appUuid", BLUEKEY_SOFTWARE_ID);
  }
  url.searchParams.set("mode", mode);
  return url.toString();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => consumeAuthExpiredMessage());
  const popupRef = useRef<Window | null>(null);
  const handledRef = useRef(false);

  const rehydrate = useCallback(() => {
    setUser(readStoredUser());
  }, []);

  const completeLogin = useCallback((accessToken: string, email: string) => {
    const next: AuthUser = {
      email: email || "signed-in@memphis.edu",
      accessToken,
      isLocalDev: false,
      sub: subFromAccessToken(accessToken),
    };
    persistUser(next);
    setUser(next);
    setError(null);
    setLoading(false);
  }, []);

  const openPopup = useCallback(() => {
    setError(null);
    handledRef.current = false;

    if (!BLUEKEY_SOFTWARE_ID) {
      setError("Bluekey is not configured. Set VITE_BLUEKEY_SOFTWARE_ID, or continue as local developer.");
      return;
    }

    setLoading(true);
    const popup = window.open(
      buildBluekeyUrl("popup"),
      "bluekeyLogin",
      "width=800,height=900",
    );

    if (!popup) {
      setLoading(false);
      setError("Sign-in popup was blocked. Allow popups for this site, or use Continue in this tab.");
      return;
    }

    popupRef.current = popup;
  }, []);

  const continueInThisTab = useCallback(() => {
    if (!BLUEKEY_SOFTWARE_ID) {
      setError("Bluekey is not configured. Set VITE_BLUEKEY_SOFTWARE_ID.");
      return;
    }
    window.location.assign(buildBluekeyUrl("popup"));
  }, []);

  const continueAsLocalDev = useCallback(() => {
    const next: AuthUser = {
      email: "dev@memphis.edu",
      accessToken: null,
      isLocalDev: true,
      sub: null,
    };
    persistUser(next);
    setUser(next);
    setError(null);
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    persistUser(null);
    setUser(null);
    setError(null);
    setLoading(false);
  }, []);

  const getAccessToken = useCallback(() => {
    if (!user || user.isLocalDev) return null;
    return user.accessToken;
  }, [user]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== BLUEKEY_ORIGIN && event.origin !== window.location.origin) {
        return;
      }

      let data: Record<string, unknown> | null = null;
      if (typeof event.data === "string") {
        try {
          data = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
          return;
        }
      } else if (event.data && typeof event.data === "object") {
        data = event.data as Record<string, unknown>;
      }
      if (!data) return;

      const type = typeof data.type === "string" ? data.type : "";
      const token = extractToken(data);
      const isSuccess = ACCEPTED_MESSAGE_TYPES.has(type) || !!token;
      if (!isSuccess) return;

      if (!token) {
        if (data.authorized === false && data.reason === "no_active_key") {
          setError(
            "Bluekey account is authenticated but not authorized for this app (no active key). Contact IIS admin.",
          );
        } else {
          setError("Bluekey did not issue an access token. Please try again.");
        }
        setLoading(false);
        return;
      }

      handledRef.current = true;
      completeLogin(token, extractEmail(data));

      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [completeLogin]);

  useEffect(() => {
    const onPageShow = () => rehydrate();
    const onFocus = () => rehydrate();
    const onExpired = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      setUser(null);
      setError(detail?.message ?? "Session expired — sign in again.");
      setLoading(false);
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired as EventListener);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired as EventListener);
    };
  }, [rehydrate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      openPopup,
      continueInThisTab,
      continueAsLocalDev,
      logout,
      getAccessToken,
      authRequired: AUTH_REQUIRED,
      softwareIdConfigured: Boolean(BLUEKEY_SOFTWARE_ID),
    }),
    [
      user,
      loading,
      error,
      openPopup,
      continueInThisTab,
      continueAsLocalDev,
      logout,
      getAccessToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
