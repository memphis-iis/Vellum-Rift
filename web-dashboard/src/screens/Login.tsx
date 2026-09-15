import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  BLUEKEY_PORTAL_URL,
  MEMPHIS_PILLAR_URL,
  VELLUM_LOGO_URL,
} from "../auth/config";
import {
  PROJECT_CITATION_AUTHORS_APA,
  PROJECT_CITATION_INSTITUTION,
  PROJECT_CITATION_PUBLISHER,
  PROJECT_CITATION_TITLE,
  PROJECT_CITATION_VERSION,
  PROJECT_CITATION_YEAR,
} from "../auth/citation";
import "../styles/bluekey.css";

/** Optional preconfigured exhibit Space for walk-up kiosk (no Bluekey). */
const MUSEUM_KIOSK_SPACE_ID = String(
  import.meta.env.VITE_MUSEUM_KIOSK_SPACE_ID ?? "",
).trim();

function goToKioskJoin(spaceId: string) {
  const id = spaceId.trim();
  if (!id) return;
  const url = new URL(window.location.href);
  url.searchParams.set("session", id);
  url.searchParams.set("kiosk", "1");
  window.location.assign(url.toString());
}

/**
 * IIS Bluekey login shell (Undertaker template), reworded for Vellum Rift.
 * Staff: Bluekey. Museum guests: kiosk path — never Bluekey-only (#180).
 */
export default function Login() {
  const {
    openPopup,
    continueInThisTab,
    continueAsLocalDev,
    loading,
    error,
    authRequired,
    softwareIdConfigured,
  } = useAuth();

  const showLocalSkip = !authRequired;
  const [guestSpaceId, setGuestSpaceId] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);

  const onGuestJoin = (e: FormEvent) => {
    e.preventDefault();
    const id = guestSpaceId.trim();
    if (!id) {
      setGuestError("Enter the Space ID from your host or signage.");
      return;
    }
    setGuestError(null);
    goToKioskJoin(id);
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-visual">
          <div className="brand-lockup">
            <div className="brand-lockup__logos">
              <a
                className="brand-lockup__logo-link"
                href="https://iis.memphis.edu/"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  className="brand-lockup__icon"
                  src={VELLUM_LOGO_URL}
                  alt="Vellum Rift logo"
                />
              </a>
              <a
                className="brand-lockup__logo-link brand-lockup__logo-link--pillar"
                href="https://www.memphis.edu/"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  className="brand-lockup__pillar"
                  src={MEMPHIS_PILLAR_URL}
                  alt="University of Memphis pillar logo"
                />
              </a>
            </div>

            <div>
              <p className="eyebrow">Institute for Intelligent Systems</p>
              <h1>Vellum Rift</h1>
            </div>
          </div>

          <p className="auth-lead">
            Spaces for web and VR. <strong>Staff</strong> sign in with Bluekey to host and upload.{" "}
            <strong>Museum guests</strong> do not need Bluekey — use the exhibit QR or guest join
            below.
          </p>

          <div className="auth-paper-ref">
            <p className="eyebrow">Citation</p>
            <p className="auth-citation">
              {PROJECT_CITATION_AUTHORS_APA} ({PROJECT_CITATION_YEAR}). <em>{PROJECT_CITATION_TITLE}</em>{" "}
              ({PROJECT_CITATION_VERSION}) [Computer software]. {PROJECT_CITATION_PUBLISHER}
            </p>
          </div>
        </div>

        <div className="auth-form-panel">
          <section className="auth-guest-panel" aria-labelledby="auth-guest-heading">
            <p className="eyebrow" id="auth-guest-heading">
              Museum / guest
            </p>
            <p className="auth-guest-lead">
              No IIS account required. Scan the host’s QR, open their kiosk link, or enter a Space
              ID if one is posted on the exhibit.
            </p>

            {MUSEUM_KIOSK_SPACE_ID ? (
              <button
                type="button"
                className="auth-guest-primary"
                onClick={() => goToKioskJoin(MUSEUM_KIOSK_SPACE_ID)}
              >
                Join museum exhibit
              </button>
            ) : null}

            <form className="auth-guest-form" onSubmit={onGuestJoin}>
              <label className="auth-guest-label" htmlFor="auth-guest-space-id">
                Space ID
              </label>
              <input
                id="auth-guest-space-id"
                className="auth-guest-input"
                value={guestSpaceId}
                onChange={(e) => {
                  setGuestSpaceId(e.target.value);
                  if (guestError) setGuestError(null);
                }}
                placeholder="Paste Space ID from signage"
                autoComplete="off"
                spellCheck={false}
              />
              {guestError ? (
                <p className="status-banner error auth-error-banner" role="alert">
                  {guestError}
                </p>
              ) : null}
              <button type="submit" className="auth-guest-secondary">
                Join as guest
              </button>
            </form>
          </section>

          <div className="auth-separator" role="presentation">
            <span>Staff</span>
          </div>

          <div className="auth-copy">
            <p className="eyebrow">Sign in</p>
            <p>
              Hosts and researchers use{" "}
              <a href={BLUEKEY_PORTAL_URL} target="_blank" rel="noreferrer">
                IIS Bluekey
              </a>{" "}
              to create Spaces, upload manuscripts, and enable kiosk for guests.
            </p>
          </div>

          <details className="auth-notice-box auth-notice-box--privacy">
            <summary className="auth-notice-box__title">Privacy & Data Notice (GDPR)</summary>
            <p>
              This application may store your name, account identifiers, space participation, and
              collaboration activity (such as chat and spatial metadata) needed to support virtual
              learning workflows.
            </p>
            <p>
              For more information about data handling, please refer to the University of Memphis privacy
              policies.
            </p>
          </details>

          <details className="auth-notice-box auth-notice-box--ai">
            <summary className="auth-notice-box__title">AI Assistance Disclosure</summary>
            <p>
              Some parts of this platform were developed with AI assistance. Optional runtime AI features,
              if enabled, may store prompts and responses for auditability. All outputs should be reviewed
              by a qualified human.
            </p>
          </details>

          {error ? <p className="status-banner error auth-error-banner">{error}</p> : null}

          {error?.toLowerCase().includes("popup") ? (
            <button type="button" className="auth-guide-btn" onClick={continueInThisTab}>
              Continue in this tab
            </button>
          ) : null}

          <div className="auth-sso-container">
            <button
              type="button"
              className="bluekey-btn"
              onClick={openPopup}
              disabled={loading || !softwareIdConfigured}
            >
              {loading ? "Signing in..." : "Sign in with Bluekey"}
            </button>

            {!softwareIdConfigured ? (
              <p className="auth-caption">
                Set <code>VITE_BLUEKEY_SOFTWARE_ID</code> in <code>web-dashboard/.env</code> to enable
                Bluekey SSO.
              </p>
            ) : null}

            {showLocalSkip ? (
              <button type="button" className="auth-dev-skip" onClick={continueAsLocalDev}>
                Continue as local developer
              </button>
            ) : null}

            <div className="auth-footer">
              <a href={BLUEKEY_PORTAL_URL} className="auth-guide-btn" target="_blank" rel="noreferrer">
                Sign up
              </a>
              <p className="auth-caption">© 2026 {PROJECT_CITATION_INSTITUTION}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
