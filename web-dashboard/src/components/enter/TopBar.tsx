import { MaterialIcon } from "../MaterialIcon";
import { ModeToggle } from "./ModeToggle";
import type { EnterLaunch } from "./useEnterLaunch";
import type { LaunchLinks } from "./useLaunchLinks";

type TopBarProps = {
  label: string;
  onLeave: () => void;
  launch: EnterLaunch;
  links: LaunchLinks;
  ready: boolean;
  hasPlayer: boolean;
};

export function TopBar({ label, onLeave, launch, links, ready, hasPlayer }: TopBarProps) {
  const observer = launch.mode === "observer";
  const disabled =
    !ready || !hasPlayer || (observer ? !links.observerUrl : !links.webGlEmbedUrl && !links.webGlUrl);
  return (
    <header className="vr-enter__top">
      <div className="vr-enter__brand">
        <span className="vr-enter__wordmark">VELLUM RIFT</span>
        <span className="vr-enter__divider" aria-hidden="true" />
        <span className="vr-enter__session-chip">
          <MaterialIcon name="hub" />
          {label}
        </span>
      </div>
      <div className="vr-enter__top-actions">
        <button type="button" className="vr-btn vr-btn--ghost" onClick={onLeave}>
          Leave space
        </button>
        {links.observerUrl ? <ModeToggle mode={launch.mode} onChange={launch.setMode} /> : null}
        <button
          type="button"
          className="vr-btn vr-btn--primary vr-enter__launch"
          onClick={launch.launch}
          disabled={disabled}
        >
          <MaterialIcon name={observer ? "tv" : "view_in_ar"} />
          {observer ? "Open display" : "Enter 3D"}
        </button>
      </div>
    </header>
  );
}
