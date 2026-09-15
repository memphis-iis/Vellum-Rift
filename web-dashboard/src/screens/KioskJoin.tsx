import { useEffect, useState, type FormEvent } from "react";
import { addPlayer, getSession } from "../api/gameState";
import { fetchKioskStatus, mintKioskToken } from "../api/kiosk";
import { buildWebGlLaunchUrl } from "../api/webGlLaunchUrl";
import { TOKEN_STORAGE_KEY, VELLUM_LOGO_URL } from "../auth/config";
import {
  launchWebGlWithAuthHandoff,
  webGlOriginFromBaseUrl,
} from "../auth/launchWebGl";
import { MaterialIcon } from "../components/MaterialIcon";

type KioskJoinProps = {
  sessionId: string;
};

type Phase = "loading" | "ready" | "launching" | "blocked" | "error";

/**
 * Museum public join (#145 / #182): no Bluekey.
 * One primary CTA: nametag → join Space → open 3D (with popup-blocked fallback).
 */
export default function KioskJoin({ sessionId }: KioskJoinProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [nametag, setNametag] = useState("Guest");
  const [busy, setBusy] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setError(null);
    setFallbackUrl(null);

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
        setLabel(status.label?.trim() || "Space");

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

  const openWebGl = (url: string, token: string): boolean => {
    const origin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
    if (!origin) {
      const win = window.open(url, "vellumRiftWebGL");
      return Boolean(win);
    }
    const win = launchWebGlWithAuthHandoff({
      url,
      accessToken: token,
      email: "",
      webGlOrigin: origin,
    });
    return Boolean(win);
  };

  const onEnter3d = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !accessToken) return;
    setBusy(true);
    setError(null);
    setFallbackUrl(null);
    const name = nametag.trim() || "Guest";
    try {
      await addPlayer(sessionId, name, false);
      await getSession(sessionId);

      const url = buildWebGlLaunchUrl({
        sessionId,
        playerName: name,
        isHost: false,
        kiosk: true,
      });
      if (!url) {
        setPhase("error");
        setError("3D is not configured on this exhibit. Ask staff for help.");
        return;
      }

      setPhase("launching");
      const opened = openWebGl(url, accessToken);
      if (!opened) {
        setFallbackUrl(url);
        setPhase("blocked");
        setError("Your browser blocked the 3D window. Use Open 3D below (or allow popups and try again).");
        return;
      }
      // Stay on launching — guest is in 3D; keep a quiet status if they return.
      setPhase("launching");
    } catch (err) {
      setPhase("ready");
      setError(err instanceof Error ? err.message : "Could not join. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const retryOpen = () => {
    if (!fallbackUrl || !accessToken) return;
    setError(null);
    const opened = openWebGl(fallbackUrl, accessToken);
    if (!opened) {
      setError("Still blocked. Tap Open 3D in this tab, or allow popups for this site.");
      return;
    }
    setPhase("launching");
    setFallbackUrl(null);
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
              : phase === "blocked"
                ? "One more tap to open 3D."
                : "No sign-in required — enter a nametag and open 3D."}
          </p>
        </header>

        {phase === "loading" ? (
          <p className="vr-kiosk__status" role="status">
            Opening kiosk…
          </p>
        ) : null}

        {phase === "error" ? (
          <div className="vr-kiosk__error-block" role="alert">
            <p className="vr-kiosk__error">{error}</p>
            <p className="vr-kiosk__hint">
              Ask staff to turn <strong>Kiosk on</strong> for this Space and share the QR or kiosk
              link. Guests do not use Bluekey.
            </p>
            <a className="vr-btn vr-btn--ghost" href={import.meta.env.BASE_URL || "/"}>
              Back to sign-in
            </a>
          </div>
        ) : null}

        {phase === "ready" || phase === "launching" || phase === "blocked" ? (
          <section className="vr-kiosk__card" aria-label={label}>
            <h2 className="vr-kiosk__space">{label}</h2>

            {phase === "ready" ? (
              <form className="vr-kiosk__form" onSubmit={(e) => void onEnter3d(e)}>
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
                <button type="submit" className="vr-btn vr-btn--primary" disabled={busy}>
                  <MaterialIcon name="view_in_ar" />
                  {busy ? "Opening 3D…" : "Enter 3D"}
                </button>
              </form>
            ) : null}

            {phase === "launching" ? (
              <div className="vr-kiosk__joined">
                <p className="vr-kiosk__status" role="status">
                  You’re in as {nametag.trim() || "Guest"}. The 3D view should open in another
                  window.
                </p>
                <button
                  type="button"
                  className="vr-btn vr-btn--primary"
                  onClick={() => {
                    const url = buildWebGlLaunchUrl({
                      sessionId,
                      playerName: nametag.trim() || "Guest",
                      isHost: false,
                      kiosk: true,
                    });
                    if (!url || !accessToken) return;
                    if (!openWebGl(url, accessToken)) {
                      setFallbackUrl(url);
                      setPhase("blocked");
                      setError(
                        "Your browser blocked the 3D window. Use Open 3D below (or allow popups).",
                      );
                    }
                  }}
                >
                  <MaterialIcon name="view_in_ar" />
                  Reopen 3D
                </button>
              </div>
            ) : null}

            {phase === "blocked" && fallbackUrl ? (
              <div className="vr-kiosk__joined">
                {error ? (
                  <p className="vr-kiosk__error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button type="button" className="vr-btn vr-btn--primary" onClick={retryOpen}>
                  <MaterialIcon name="view_in_ar" />
                  Open 3D
                </button>
                <p className="vr-kiosk__hint">
                  This uses a browser popup. If nothing opens, allow popups for this site and tap
                  Open 3D again.
                </p>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
