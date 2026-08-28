import { useEffect, useRef, type FormEvent } from "react";
import type { ChatMessage } from "../api/gameState";
import type { LocalIdentity, SessionRoomStatus } from "../hooks/useSessionRoom";
import { MaterialIcon } from "./MaterialIcon";
import { SpaceChatPanel } from "./SpaceChatPanel";
import {
  mountWebGlAuthHandoff,
  readDashboardAccessToken,
  webGlOriginFromBaseUrl,
} from "../auth/launchWebGl";

type WebGlEmbedProps = {
  url: string;
  sessionLabel: string;
  email: string;
  messages: ChatMessage[];
  me: LocalIdentity | null;
  status: SessionRoomStatus;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (e: FormEvent) => void;
  onExit: () => void;
  onLeaveSession: () => void;
};

/**
 * Full-viewport embedded Unity WebGL player with Vellum Enter chrome.
 * Uses embed=1 on the WebGL URL (canvas only inside the iframe).
 */
export function WebGlEmbed({
  url,
  sessionLabel,
  email,
  messages,
  me,
  status,
  draft,
  onDraftChange,
  onSend,
  onExit,
  onLeaveSession,
}: WebGlEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    const webGlOrigin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
    if (!iframe || !webGlOrigin) return;

    const attach = () => {
      const win = iframe.contentWindow;
      if (!win) return undefined;
      return mountWebGlAuthHandoff({
        target: win,
        webGlOrigin,
        accessToken: readDashboardAccessToken(),
        email,
      });
    };

    let cleanup = attach();
    const onLoad = () => {
      cleanup?.();
      cleanup = attach();
    };
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      cleanup?.();
    };
  }, [url, email]);

  return (
    <div className="vr-enter-3d">
      <iframe
        ref={iframeRef}
        className="vr-enter-3d__frame"
        src={url}
        title="Vellum Rift 3D experience"
        allow="fullscreen; autoplay"
      />

      <div className="vr-enter-3d__chrome" aria-hidden={false}>
        <header className="vr-enter-3d__header">
          <div className="vr-enter-3d__brand">
            <span className="vr-enter-3d__wordmark">VELLUM RIFT</span>
            <span className="vr-enter-3d__divider" aria-hidden="true" />
            <span className="vr-enter-3d__session">
              <MaterialIcon name="public" />
              {sessionLabel}
            </span>
          </div>
          <div className="vr-enter-3d__actions">
            <button type="button" className="vr-btn vr-btn--ghost" onClick={onExit}>
              <MaterialIcon name="arrow_back" />
              Back to lobby
            </button>
            <button type="button" className="vr-btn vr-btn--primary" onClick={onLeaveSession}>
              Leave session
            </button>
          </div>
        </header>

        <SpaceChatPanel
          className="vr-enter-3d__chat glass-panel"
          messages={messages}
          me={me}
          status={status}
          draft={draft}
          onDraftChange={onDraftChange}
          onSubmit={onSend}
        />

        <div className="vr-enter-3d__fog" aria-hidden="true" />

        <div className="vr-enter-3d__controls" aria-label="Controls">
          <span>
            <kbd className="vr-enter-3d__key">W</kbd>
            <kbd className="vr-enter-3d__key">A</kbd>
            <kbd className="vr-enter-3d__key">S</kbd>
            <kbd className="vr-enter-3d__key">D</kbd>
            Move
          </span>
          <span className="vr-enter-3d__sep" aria-hidden="true" />
          <span>
            <MaterialIcon name="mouse" />
            Look
          </span>
          <span className="vr-enter-3d__sep" aria-hidden="true" />
          <span>
            <kbd className="vr-enter-3d__key">LMB</kbd>
            Laser
          </span>
          <span className="vr-enter-3d__sep" aria-hidden="true" />
          <span>
            <kbd className="vr-enter-3d__key">F</kbd>
            Pin
          </span>
        </div>
      </div>
    </div>
  );
}
