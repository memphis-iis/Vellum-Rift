import { BrandMark } from "./BrandMark";
import { MaterialIcon } from "./MaterialIcon";
import type { AppSection } from "./AppChrome";

type SideNavProps = {
  active: AppSection;
  email: string;
  onNavigate: (section: AppSection) => void;
  onSignOut: () => void;
  onNewSession?: () => void;
  /** Hide Demos nav when catalog is empty. */
  showDemos?: boolean;
  /** Guest browse: Home + Demos only (no upload / Spaces). */
  guestMode?: boolean;
};

const NAV: { id: AppSection; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "demos", label: "Demos", icon: "auto_awesome" },
  { id: "upload", label: "Upload", icon: "upload_file" },
  { id: "documents", label: "Library", icon: "view_in_ar" },
  { id: "sessions", label: "Spaces", icon: "history_edu" },
  { id: "enter", label: "Lobby", icon: "login" },
];

const GUEST_NAV_IDS = new Set<AppSection>(["home", "demos"]);

export function SideNav({
  active,
  email,
  onNavigate,
  onSignOut,
  onNewSession,
  showDemos = true,
  guestMode = false,
}: SideNavProps) {
  const links = NAV.filter((item) => {
    if (item.id === "demos" && !showDemos) return false;
    if (guestMode && !GUEST_NAV_IDS.has(item.id)) return false;
    return true;
  });
  return (
    <>
      <nav className="vr-sidenav" aria-label="Primary">
        <div className="vr-sidenav__brand">
          <button
            type="button"
            className="vr-sidenav__brand-btn"
            onClick={() => onNavigate("home")}
            aria-label="Vellum Rift home"
          >
            <BrandMark variant="full" size="lg" />
          </button>
          <p className="vr-sidenav__eyebrow">Virtual Learning Spaces</p>
        </div>

        {!guestMode ? (
          <div className="vr-sidenav__cta-wrap">
            <button
              type="button"
              className="vr-btn vr-btn--ghost vr-sidenav__cta"
              onClick={() => (onNewSession ? onNewSession() : onNavigate("upload"))}
            >
              <MaterialIcon name="add" filled />
              New space
            </button>
          </div>
        ) : null}

        <div className="vr-sidenav__links">
          {links.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`vr-sidenav__link${active === item.id ? " vr-sidenav__link--active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <MaterialIcon name={item.icon} filled={active === item.id} />
              <span className="vr-sidenav__link-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="vr-sidenav__footer">
          <p className="vr-sidenav__email">{email}</p>
          <button type="button" className="vr-sidenav__sign-out" onClick={onSignOut}>
            {guestMode ? "Sign in" : "Sign Out"}
          </button>
        </div>
      </nav>

      <header className="vr-mobile-top">
        <button type="button" className="vr-mobile-top__brand" onClick={() => onNavigate("home")}>
          <BrandMark variant="mark" size="sm" />
        </button>
        {guestMode ? (
          <button
            type="button"
            className="vr-mobile-top__menu"
            onClick={() => onNavigate(showDemos ? "demos" : "home")}
            aria-label={showDemos ? "Demos" : "Home"}
          >
            <MaterialIcon name={showDemos ? "auto_awesome" : "home"} />
          </button>
        ) : (
          <button
            type="button"
            className="vr-mobile-top__menu"
            onClick={() => onNavigate("upload")}
            aria-label="Upload"
          >
            <MaterialIcon name="upload_file" />
          </button>
        )}
      </header>
    </>
  );
}
