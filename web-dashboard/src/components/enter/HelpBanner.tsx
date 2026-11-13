import type { HelpRequest } from "../../api/gameState";
import { MaterialIcon } from "../MaterialIcon";
import { formatHelpRequestTime } from "./helpers";

type HelpBannerProps = {
  requests: HelpRequest[];
  busy: boolean;
  onAcknowledge: (requestId: string) => void;
};

export function HelpBanner({ requests, busy, onAcknowledge }: HelpBannerProps) {
  return (
    <section className="vr-enter__help-banner" role="alert" aria-live="polite">
      <div className="vr-enter__help-banner-head">
        <MaterialIcon name="support_agent" />
        <strong>Call for help</strong>
      </div>
      <ul className="vr-enter__help-banner-list">
        {requests.map((req) => (
          <li key={req.id} className="vr-enter__help-banner-item">
            <span>
              {req.playerName}{" "}
              <time dateTime={req.createdAt}>{formatHelpRequestTime(req.createdAt)}</time>
            </span>
            <button
              type="button"
              className="vr-btn vr-btn--primary vr-enter__help-ack"
              disabled={busy}
              onClick={() => onAcknowledge(req.id)}
            >
              Acknowledge
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
