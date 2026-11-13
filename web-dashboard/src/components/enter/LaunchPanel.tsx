import { MaterialIcon } from "../MaterialIcon";
import { ModeToggle } from "./ModeToggle";
import type { CopyKind } from "./helpers";
import type { EnterLaunch } from "./useEnterLaunch";
import type { LaunchLinks } from "./useLaunchLinks";

type LaunchPanelProps = {
  launch: EnterLaunch;
  links: LaunchLinks;
  ready: boolean;
  hasPlayer: boolean;
  copied: CopyKind | null;
  onCopy: (kind: CopyKind, text: string) => void;
};

function launchLabel(observer: boolean, links: LaunchLinks): string {
  if (observer) return links.observerUrl ? "Open display" : "Launch options";
  return links.webGlEmbedUrl ? "Enter 3D" : "Launch options";
}

function hasLaunchTarget(observer: boolean, links: LaunchLinks): boolean {
  if (observer) return Boolean(links.observerUrl);
  return Boolean(links.webGlEmbedUrl || links.webGlUrl);
}

function LaunchRow({ launch, links, ready, hasPlayer }: LaunchPanelProps) {
  const observer = launch.mode === "observer";
  const target = observer ? links.observerUrl : links.webGlUrl;
  const disabled = !ready || !hasPlayer || !hasLaunchTarget(observer, links);
  return (
    <div className="vr-enter__launch-row">
      {links.observerUrl ? <ModeToggle mode={launch.mode} onChange={launch.setMode} /> : null}
      <button type="button" className="vr-btn vr-btn--primary" onClick={launch.launch} disabled={disabled}>
        <MaterialIcon name={observer ? "tv" : "view_in_ar"} />
        {launchLabel(observer, links)}
      </button>
      {target ? (
        <button
          type="button"
          className="vr-btn vr-btn--outline"
          onClick={launch.openNewTab}
          disabled={!ready || !hasPlayer}
        >
          <MaterialIcon name="open_in_new" />
          New tab
        </button>
      ) : null}
      <button
        type="button"
        className="vr-btn vr-btn--outline"
        onClick={launch.toggleDesktop}
        disabled={!ready || !hasPlayer}
      >
        <MaterialIcon name="desktop_windows" />
        Desktop
      </button>
    </div>
  );
}

function DesktopPanel({ links, copied, onCopy }: LaunchPanelProps) {
  return (
    <div className="vr-enter__desktop">
      <p>
        Desktop join uses CLI handoff (#128 / #129). Copy and run against your standalone build
        (token included when you are signed in - treat it like a password):
      </p>
      <pre className="vr-enter__code">{links.desktopCmd}</pre>
      <button type="button" className="vr-btn vr-btn--ghost" onClick={() => onCopy("desktop", links.desktopCmd)}>
        <MaterialIcon name="content_copy" />
        {copied === "desktop" ? "Copied" : "Copy command"}
      </button>
      {!links.webGlUrl ? (
        <p className="vr-enter__hint">
          Set <code>VITE_WEBGL_BASE_URL</code> to enable one-click WebGL launch.
        </p>
      ) : null}
    </div>
  );
}

export function LaunchPanel(props: LaunchPanelProps) {
  return (
    <>
      <LaunchRow {...props} />
      {props.launch.showDesktop && props.hasPlayer ? <DesktopPanel {...props} /> : null}
    </>
  );
}
