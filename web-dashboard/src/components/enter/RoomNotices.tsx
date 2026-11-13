import type { HelpRequest } from "../../api/gameState";
import { ShareQrPanel } from "../ShareQrPanel";
import { HelpBanner } from "./HelpBanner";
import type { CopyKind } from "./helpers";

type HostNoticesProps = {
  status: string | null;
  helpRequests: HelpRequest[];
  busy: boolean;
  onAcknowledge: (requestId: string) => void;
  shareUrl: string;
  shareOpen: boolean;
  onShareClose: () => void;
  kioskEnabled: boolean;
  copied: CopyKind | null;
  onCopy: (kind: CopyKind, text: string) => void;
};

const SHARE_HINT_KIOSK =
  "Guests open this without Bluekey. Turn Kiosk off to share a signed-in invite instead.";
const SHARE_HINT_INVITE =
  "Signed-in colleagues use this link. Enable Kiosk for a museum QR without Bluekey.";

/** Status line, help requests and the share QR dialog (host only). */
export function HostNotices(p: HostNoticesProps) {
  return (
    <>
      {p.status ? (
        <p className="vr-enter__invite-status" role="status">
          {p.status}
        </p>
      ) : null}
      {p.helpRequests.length > 0 ? (
        <HelpBanner requests={p.helpRequests} busy={p.busy} onAcknowledge={p.onAcknowledge} />
      ) : null}
      {p.shareUrl ? (
        <ShareQrPanel
          open={p.shareOpen}
          onClose={p.onShareClose}
          url={p.shareUrl}
          title={p.kioskEnabled ? "Kiosk / public join" : "Share invite link"}
          hint={p.kioskEnabled ? SHARE_HINT_KIOSK : SHARE_HINT_INVITE}
          onCopy={() => p.onCopy("share", p.shareUrl)}
          copied={p.copied === "share"}
        />
      ) : null}
    </>
  );
}

type RoomAlertsProps = {
  error: string | null;
  connecting: boolean;
  displayName: string;
  onRetry: () => void;
};

export function RoomAlerts({ error, connecting, displayName, onRetry }: RoomAlertsProps) {
  return (
    <>
      {error ? (
        <p className="vr-enter__error" role="alert">
          {error}{" "}
          <button type="button" className="vr-enter__retry" onClick={onRetry}>
            Retry
          </button>
        </p>
      ) : null}
      {connecting ? <p className="vr-enter__status">Joining space as {displayName}…</p> : null}
    </>
  );
}
