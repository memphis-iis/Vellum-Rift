import { BrandMark } from "./BrandMark";
import { MaterialIcon } from "./MaterialIcon";
import type { AppSection } from "./AppChrome";

type SideNavProps = {
  active: AppSection;
  email: string;
  onNavigate: (section: AppSection) => void;
  onSignOut: () => void;
  onNewSession?: () => void;
};

const NAV: { id: AppSection; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "upload", label: "Upload", icon: "upload_file" },
  { id: "sessions", label: "Sessions", icon: "history_edu" },
  { id: "enter", label: "Enter", icon: "login" },
];

export function SideNav({ active, email, onNavigate, onSignOut, onNewSession }: SideNavProps) {
  return (
    <>
      <nav className="vr-sidenav" aria-label="Primary">
        <div className="vr-sidenav__brand">
          <button type="button" className="vr-sidenav__brand-btn" onClick={() => onNavigate("home")}>
            <BrandMark variant="mark" size="sm" />
          </button>
          <p className="vr-sidenav__eyebrow">Manuscript Explorer</p>
        </div>

        <div className="vr-sidenav__cta-wrap">
          <button
            type="button"
            className="vr-btn vr-btn--ghost vr-sidenav__cta"
            onClick={() => (onNewSession ? onNewSession() : onNavigate("upload"))}
          >
            <MaterialIcon name="add" filled />
            New Session
          </button>
        </div>

        <div className="vr-sidenav__links">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`vr-sidenav__link${active === item.id ? " vr-sidenav__link--active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <MaterialIcon name={item.icon} filled={active === item.id} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="vr-sidenav__footer">
          <p className="vr-sidenav__email">{email}</p>
          <button type="button" className="vr-sidenav__sign-out" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </nav>

      <header className="vr-mobile-top">
        <button type="button" className="vr-mobile-top__brand" onClick={() => onNavigate("home")}>
          <BrandMark variant="mark" size="sm" />
        </button>
        <button type="button" className="vr-mobile-top__menu" onClick={() => onNavigate("upload")} aria-label="Upload">
          <MaterialIcon name="upload_file" />
        </button>
      </header>
    </>
  );
}
