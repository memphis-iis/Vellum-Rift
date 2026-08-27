import { useAuth } from "../auth/AuthContext";
import {
  BLUEKEY_PORTAL_URL,
  MEMPHIS_PILLAR_URL,
  VELLUM_LOGO_URL,
} from "../auth/config";
import "../styles/bluekey.css";

/**
 * IIS Bluekey login shell (Undertaker template), reworded for Vellum Rift.
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
            Welcome to Vellum Rift — virtual learning spaces for web and VR. Sign in with your IIS
            Bluekey account to upload manuscripts and join collaborative spaces.
          </p>
        </div>

        <div className="auth-form-panel">
          <div className="auth-copy">
            <p className="eyebrow">Sign in</p>
            <p>
              Use your{" "}
              <a href={BLUEKEY_PORTAL_URL} target="_blank" rel="noreferrer">
                IIS Bluekey
              </a>{" "}
              account to access Vellum Rift.
            </p>
          </div>

          <details className="auth-notice-box auth-notice-box--privacy">
            <summary className="auth-notice-box__title">Privacy &amp; Data Notice (GDPR)</summary>
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
              <p className="auth-caption">
                © 2026 University of Memphis, Institute for Intelligent Systems
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
