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
import "../styles/vr-theme.css";

/**
 * IIS Bluekey login shell.
 * Guests continue without signing in → Try now / Demos only.
 * Museum/classroom kits still use hardcoded kiosk URLs (`?session=&kiosk=1`).
 */
export default function Login() {
  const {
    openPopup,
    continueInThisTab,
    continueAsLocalDev,
    continueAsGuest,
    loading,
    error,
    authRequired,
    softwareIdConfigured,
  } = useAuth();

  const showLocalSkip = !authRequired;

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
                rel="noopener noreferrer"
              >
                <img
                  className="brand-lockup__icon"
                  src={VELLUM_LOGO_URL}
                  alt="Institute for Intelligent Systems, University of Memphis (opens in new tab)"
                />
              </a>
              <a
                className="brand-lockup__logo-link brand-lockup__logo-link--pillar"
                href="https://www.memphis.edu/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="brand-lockup__pillar"
                  src={MEMPHIS_PILLAR_URL}
                  alt="University of Memphis (opens in new tab)"
                />
              </a>
            </div>

            <div>
              <p className="eyebrow">Institute for Intelligent Systems</p>
              <h1>Vellum Rift</h1>
            </div>
          </div>

          <p className="auth-lead">
            Spaces for web&nbsp;and&nbsp;VR. <strong>Sign in with Bluekey</strong> to host, upload, or
            join with an IIS account — or continue without logging in to try example demos.
          </p>

          <div className="auth-paper-ref">
            <p className="eyebrow">Credits and citation</p>
            <p className="auth-citation">
              {PROJECT_CITATION_AUTHORS_APA} ({PROJECT_CITATION_YEAR}). <em>{PROJECT_CITATION_TITLE}</em>{" "}
              ({PROJECT_CITATION_VERSION}) [Computer software]. {PROJECT_CITATION_PUBLISHER}
            </p>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-copy">
            <p className="eyebrow">Sign in</p>
            <p>
              Have an IIS account? Use{" "}
              <a href={BLUEKEY_PORTAL_URL} target="_blank" rel="noreferrer">
                IIS Bluekey
              </a>{" "}
              to create Spaces, upload assets, and manage sessions.
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

            <button
              type="button"
              className="auth-guest-continue"
              onClick={continueAsGuest}
              disabled={loading}
            >
              Continue without logging in
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
