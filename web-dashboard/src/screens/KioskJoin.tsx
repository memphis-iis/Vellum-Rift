import { useEffect, useMemo, useState, type FormEvent } from "react";
import { API_BASE_URL } from "../api/config";
import { addPlayer, getSession, type GameSession } from "../api/gameState";
import { fetchKioskStatus, mintKioskToken } from "../api/kiosk";
import { TOKEN_STORAGE_KEY } from "../auth/config";
import {
  launchWebGlWithAuthHandoff,
  webGlOriginFromBaseUrl,
} from "../auth/launchWebGl";
import { MaterialIcon } from "../components/MaterialIcon";
import { VELLUM_LOGO_URL } from "../auth/config";

type KioskJoinProps = {
  sessionId: string;
};

function buildWebGlLaunchUrl(sessionId: string, playerName: string): string | null {
  const base = (import.meta.env.VITE_WEBGL_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  const url = new URL(base.includes("://") ? base : `https://${base}`);
  url.searchParams.set("session", sessionId);
  url.searchParams.set("playerName", playerName);
  url.searchParams.set("isHost", "false");
  url.searchParams.set("backendUrl", API_BASE_URL);
  return url.toString();
}

/**
 * Museum public join (#145): no Bluekey. Guests mint a short-lived kiosk token,
 * join as Guest (or nametag), then launch WebGL with the same postMessage handoff.
 */
export default function KioskJoin({ sessionId }: KioskJoinProps) {
  const [phase, setPhase] = useState<"loading" | "ready" | "joined" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [nametag, setNametag] = useState("Guest");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<GameSession | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setError(null);

    void (async () => {
      try {
        const status = await fetchKioskStatus(sessionId);
        if (cancelled) return;
        if (!status.kioskEnabled) {
          setPhase("error");
          setError("Kiosk join is not enabled for this space.");
          return;
        }
        if (status.isActive === false) {
          setPhase("error");
          setError("This space is not active.");
          return;
        }
        setLabel(status.label?.trim() || "Learning space");

        const minted = await mintKioskToken(sessionId);
        if (cancelled) return;
        sessionStorage.setItem(TOKEN_STORAGE_KEY, minted.accessToken);
        setAccessToken(minted.accessToken);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setError(err instanceof Error ? err.message : "Unable to open kiosk join");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const webGlUrl = useMemo(() => {
    if (!session) return null;
    const stamped = session.players.find((p) => p.bluekeySub?.startsWith("kiosk:"));
    const name = (stamped?.displayName || nametag.trim() || "Guest").trim();
    return buildWebGlLaunchUrl(sessionId, name);
  }, [session, sessionId, nametag]);

  const onJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      // Token already in sessionStorage for getAuthHeaders.
      await addPlayer(sessionId, nametag.trim() || "Guest", false);
      const next = await getSession(sessionId);
      setSession(next);
      setPhase("joined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setBusy(false);
    }
  };

  const launchWebGl = () => {
    if (!webGlUrl || !accessToken) return;
    const origin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
    if (!origin) {
      window.open(webGlUrl, "vellumRiftWebGL");
      return;
    }
    launchWebGlWithAuthHandoff({
      url: webGlUrl,
      accessToken,
      email: "",
      webGlOrigin: origin,
    });
  };

  return (
    <div className="vr-app vr-app--shell">
      <main className="vr-kiosk">
        <header className="vr-kiosk__header">
          <img className="vr-kiosk__logo" src={VELLUM_LOGO_URL} alt="" width={48} height={48} />
          <p className="vr-kiosk__eyebrow">Vellum Rift</p>
          <h1 className="vr-kiosk__title">Join the space</h1>
          <p className="vr-kiosk__lead">
            {phase === "error"
              ? "Public join is unavailable."
              : "No sign-in required — enter a nametag and open the 3D room."}
          </p>
        </header>

        {phase === "loading" ? (
          <p className="vr-kiosk__status" role="status">
            Opening kiosk…
          </p>
        ) : null}

        {phase === "error" ? (
          <p className="vr-kiosk__error" role="alert">
            {error}
          </p>
        ) : null}

        {phase === "ready" || phase === "joined" ? (
          <section className="vr-kiosk__card" aria-label={label}>
            <h2 className="vr-kiosk__space">{label}</h2>
            {phase === "ready" ? (
              <form className="vr-kiosk__form" onSubmit={(e) => void onJoin(e)}>
                <label className="vr-kiosk__label" htmlFor="kiosk-nametag">
                  Nametag
                </label>
                <input
                  id="kiosk-nametag"
                  className="vr-kiosk__input"
                  value={nametag}
                  onChange={(e) => setNametag(e.target.value)}
                  maxLength={40}
                  placeholder="Guest"
                  autoComplete="nickname"
                />
                {error ? (
                  <p className="vr-kiosk__error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="vr-btn vr-btn--primary"
                  disabled={busy}
                >
                  <MaterialIcon name="login" />
                  {busy ? "Joining…" : "Join"}
                </button>
              </form>
            ) : (
              <div className="vr-kiosk__joined">
                <p className="vr-kiosk__status" role="status">
                  You’re in as {nametag.trim() || "Guest"}.
                </p>
                <button
                  type="button"
                  className="vr-btn vr-btn--primary"
                  onClick={launchWebGl}
                  disabled={!webGlUrl}
                >
                  <MaterialIcon name="view_in_ar" />
                  Enter 3D space
                </button>
                {!webGlUrl ? (
                  <p className="vr-kiosk__hint">
                    WebGL URL is not configured on this dashboard build.
                  </p>
                ) : null}
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
