import type { GameSession, PlayerState } from "../../api/gameState";
import { MaterialIcon } from "../MaterialIcon";
import { ShareRow, SpaceRow } from "./HostBasics";
import {
  AllowlistPanel,
  DemoAdminPanel,
  DepthControl,
  TurnTimer,
} from "./HostSections";
import { Roster } from "./Roster";
import type { CopyKind } from "./helpers";
import type { AllowlistState } from "./useAllowlist";
import type { DemoAdminState } from "./useDemoAdmin";
import type { DepthState } from "./useDepthScale";
import type { HostRunner } from "./useHostRunner";
import type { LaunchLinks } from "./useLaunchLinks";
import type { useModerationActions, useMuseumActions } from "./useModerationActions";
import type { useSpaceActions } from "./useSpaceActions";

export type HostToolsProps = {
  host: HostRunner;
  session: GameSession | null;
  visibility: "public" | "private";
  kioskEnabled: boolean;
  spaceKind: string;
  experiencePhase: string;
  isMuseumPath: boolean;
  space: ReturnType<typeof useSpaceActions>;
  links: LaunchLinks;
  copied: CopyKind | null;
  onCopy: (kind: CopyKind, text: string) => void;
  hasShareUrl: boolean;
  onOpenShare: () => void;
  allowlist: AllowlistState;
  depth: DepthState;
  demo: DemoAdminState;
  visiblePlayers: PlayerState[];
  meId: string | undefined;
  moderation: ReturnType<typeof useModerationActions>;
  museum: ReturnType<typeof useMuseumActions>;
};

function MoreOptions(p: HostToolsProps) {
  const busy = p.host.busy;
  return (
    <details className="vr-enter__host-more">
      <summary className="vr-enter__host-more-summary">More host options</summary>
      <div className="vr-enter__host-more-body">
        <DepthControl depth={p.depth} />
        {p.demo.isDemoAdmin ? <DemoAdminPanel demo={p.demo} busy={busy} /> : null}
        <TurnTimer busy={busy} session={p.session} ended={p.experiencePhase === "ended"} space={p.space} />
        <AllowlistPanel allowlist={p.allowlist} busy={busy} visibility={p.visibility} />
        <Roster
          players={p.visiblePlayers}
          meId={p.meId}
          busy={busy}
          isMuseumPath={p.isMuseumPath}
          moderation={p.moderation}
          museum={p.museum}
        />
      </div>
    </details>
  );
}

export function HostTools(p: HostToolsProps) {
  return (
    <details className="vr-enter__host-ops">
      <summary className="vr-enter__host-ops-summary">
        <MaterialIcon name="admin_panel_settings" />
        Host tools
        <span className="vr-enter__host-ops-hint">Space · Share</span>
      </summary>
      <div className="vr-enter__host-ops-toolbar">
        <SpaceRow
          busy={p.host.busy}
          visibility={p.visibility}
          spaceKind={p.spaceKind}
          kioskEnabled={p.kioskEnabled}
          space={p.space}
        />
        <ShareRow
          kioskEnabled={p.kioskEnabled}
          links={p.links}
          copied={p.copied}
          onCopy={p.onCopy}
          hasShareUrl={p.hasShareUrl}
          onOpenShare={p.onOpenShare}
          allowlist={p.allowlist}
        />
      </div>
      <MoreOptions {...p} />
    </details>
  );
}
