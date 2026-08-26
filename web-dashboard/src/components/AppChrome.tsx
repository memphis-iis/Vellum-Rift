import { BrandMark } from "./BrandMark";
import { MaterialIcon } from "./MaterialIcon";

export type AppSection = "home" | "upload" | "sessions" | "enter";

type AppChromeProps = {
  active: AppSection;
  email: string;
  onNavigate: (section: AppSection) => void;
  onSignOut: () => void;
};

const NAV: { id: AppSection; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "upload", label: "Upload", icon: "upload_file" },
  { id: "sessions", label: "Sessions", icon: "history_edu" },
  { id: "enter", label: "Enter", icon: "login" },
];

export function AppChrome({ active, email, onNavigate, onSignOut }: AppChromeProps) {
  return (
    <>
      <header className="vr-header">
        <button
          type="button"
          className="vr-header__brand-btn"
          onClick={() => onNavigate("home")}
          aria-label="Vellum Rift home"
        >
          <BrandMark variant="mark" size="sm" />
        </button>
        <nav className="vr-header__nav" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`vr-header__link${active === item.id ? " vr-header__link--active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="vr-header__user">
          <span className="vr-header__email">{email}</span>
          <button type="button" className="vr-header__sign-out" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      <nav className="vr-tabbar" aria-label="Mobile">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`vr-tabbar__item${active === item.id ? " vr-tabbar__item--active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <MaterialIcon name={item.icon} filled={active === item.id} />
            <span className="vr-tabbar__label">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
