import { useEffect, useState, type FormEvent } from "react";
import { addPlayer, getSession, type GameSession } from "../api/gameState";
import { fetchKioskStatus, mintKioskToken } from "../api/kiosk";
import { fetchModelMeta } from "../api/models";
import {
  sessionActiveModelId,
  sessionPlaylist,
  shortModelLabel,
} from "../api/playlistHelpers";
import { buildWebGlLaunchUrl } from "../api/webGlLaunchUrl";
import { TOKEN_STORAGE_KEY, VELLUM_LOGO_URL } from "../auth/config";
import {
  broadcastWebGlAuth,
  launchWebGlSameTab,
  launchWebGlWithAuthHandoff,
  mountWebGlAuthHandoff,
  webGlOriginFromBaseUrl,
} from "../auth/launchWebGl";
import { MaterialIcon } from "../components/MaterialIcon";
import { ManuscriptPreview } from "../components/ManuscriptPreview";
import { useModelPreview } from "../hooks/useModelPreview";

type KioskJoinProps = {
  sessionId: string;
};

type Phase = "loading" | "ready" | "launching" | "blocked" | "error";

/**
 * Museum public join (#145 / #182): no Bluekey.
 * One primary CTA: nametag → join Space → open 3D (with popup-blocked fallback).
 * Loadout preview (#239): guests can inspect playlist meshes before Enter 3D.
 */
export default function KioskJoin({ sessionId }: KioskJoinProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [nametag, setNametag] = useState("Guest");
  const [busy, setBusy] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [previewModelId, setPreviewModelId] = useState<string | null>(null);
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});

  const loadoutPreview = useModelPreview(previewModelId);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setError(null);
    setFallbackUrl(null);
    setPlaylist([]);
    setActiveModelId(null);
    setPreviewModelId(null);

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

        try {
          const session = (await getSession(sessionId)) as GameSession;
          if (cancelled) return;
          const nextPlaylist = sessionPlaylist(session);
          const nextActive = sessionActiveModelId(session);
          setPlaylist(nextPlaylist);
          setActiveModelId(nextActive);
          setPreviewModelId(nextActive ?? nextPlaylist[0] ?? null);
        } catch {
          /* preview optional if session fetch fails */
        }

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

  useEffect(() => {
    if (!playlist.length) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        playlist.map(async (modelId) => {
          try {
            const meta = await fetchModelMeta(modelId);
            if (!cancelled) next[modelId] = meta.label?.trim() || modelId;
          } catch {
            /* optional */
          }
        }),
      );
      if (!cancelled && Object.keys(next).length) {
        setModelLabels((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playlist.join("|")]);

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

  /**
   * Enter 3D: reserve a popup under the click gesture BEFORE awaits (#261),
   * then navigate + hand off auth. If reservation fails, same-tab fallback (#254).
   */
  const onEnter3d = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !accessToken) return;
    setBusy(true);
    setError(null);
    setFallbackUrl(null);
    const name = nametag.trim() || "Guest";

    const url = buildWebGlLaunchUrl({
      sessionId,
      playerName: name,
      isHost: false,
      kiosk: true,
    });
    if (!url) {
      setPhase("error");
      setError("3D is not configured on this exhibit. Ask staff for help.");
      setBusy(false);
      return;
    }

    // Must run synchronously in the user-gesture stack — awaits break popup unlock.
    let reserved: Window | null = null;
    try {
      reserved = window.open("about:blank", "vellumRiftWebGL");
    } catch {
      reserved = null;
    }
    const reservedOk = Boolean(reserved && !reserved.closed);

    try {
      await addPlayer(sessionId, name, false);
      await getSession(sessionId);

      broadcastWebGlAuth(accessToken, "");
      const webGlOrigin = webGlOriginFromBaseUrl(
        import.meta.env.VITE_WEBGL_BASE_URL ?? "",
      );

      if (reservedOk && reserved && !reserved.closed) {
        try {
          reserved.location.href = url;
        } catch {
          /* cross-origin assign may throw after navigate — ignore */
        }
        if (webGlOrigin) {
          mountWebGlAuthHandoff({
            target: reserved,
            accessToken,
            email: "",
            webGlOrigin,
          });
        }
        setPhase("launching");
        return;
      }

      // Popup unavailable — same-tab continue (do not claim "blocked" if we never opened).
      setFallbackUrl(url);
      setPhase("blocked");
      setError(
        "Could not open a separate 3D window. Continue in this tab, or allow popups and retry.",
      );
    } catch (err) {
      try {
        reserved?.close();
      } catch {
        /* ignore */
      }
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
      setError("Still blocked. Use Open 3D in this tab below, or allow popups.");
      return;
    }
    setPhase("launching");
    setFallbackUrl(null);
  };

  const openSameTab = () => {
    if (!fallbackUrl || !accessToken) return;
    launchWebGlSameTab({ url: fallbackUrl, accessToken, email: "" });
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
                : "No sign-in required — preview the exhibit, enter a nametag, and open 3D."}
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
              {/space not found|check the id/i.test(error ?? "") ? (
                <>
                  Double-check the Space ID on the exhibit signage or QR code. Guests do not use
                  Bluekey.
                </>
              ) : (
                <>
                  Ask staff to turn <strong>Kiosk on</strong> for this Space and share the QR or
                  kiosk link. Guests do not use Bluekey.
                </>
              )}
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
              <>
                <div className="vr-kiosk__loadout" aria-label="Exhibit manuscripts">
                  <ManuscriptPreview
                    className="vr-kiosk__preview"
                    preview={loadoutPreview}
                    emptyMessage="No manuscripts in this exhibit yet."
                    alt={
                      previewModelId
                        ? shortModelLabel(previewModelId, modelLabels[previewModelId])
                        : undefined
                    }
                  />
                  {playlist.length ? (
                    <ul className="vr-kiosk__playlist">
                      {playlist.map((modelId) => {
                        const isActive = modelId === activeModelId;
                        const isPreviewing = modelId === previewModelId;
                        const title = shortModelLabel(modelId, modelLabels[modelId]);
                        return (
                          <li key={modelId}>
                            <button
                              type="button"
                              className={`vr-kiosk__playlist-btn${isPreviewing ? " vr-kiosk__playlist-btn--previewing" : ""}`}
                              aria-pressed={isPreviewing}
                              onClick={() => setPreviewModelId(modelId)}
                            >
                              <MaterialIcon
                                name={isActive ? "check_circle" : "radio_button_unchecked"}
                              />
                              <span>{title}</span>
                              {isActive ? <span className="vr-kiosk__active-badge">Active</span> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="vr-kiosk__hint">No manuscripts in this exhibit yet.</p>
                  )}
                </div>

                <form className="vr-kiosk__form" onSubmit={(e) => void onEnter3d(e)}>
                  <label className="vr-kiosk__label" htmlFor="kiosk-nametag">
                    Nametag
                  </label>
                  <input
                    id="kiosk-nametag"
                    className="vr-kiosk__input"
                    value={nametag}
                    onChange={(e) => setNametag(e.target.value)}
                    maxLength={20}
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
              </>
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
                <button type="button" className="vr-btn vr-btn--primary" onClick={openSameTab}>
                  <MaterialIcon name="view_in_ar" />
                  Open 3D in this tab
                </button>
                <button type="button" className="vr-btn vr-btn--ghost" onClick={retryOpen}>
                  Try popup again
                </button>
                <p className="vr-kiosk__hint">
                  Prefer the same-tab button on locked-down exhibit browsers. Popup needs permission
                  for this site.
                </p>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
