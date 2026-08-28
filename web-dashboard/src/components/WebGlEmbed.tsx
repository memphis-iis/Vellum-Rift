import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../api/gameState";
import type { LocalIdentity, SessionRoomStatus } from "../hooks/useSessionRoom";
import {
  mountWebGlPinHandoff,
  postPinNameResult,
  type PinNameRequestPayload,
} from "../auth/mountWebGlPinHandoff";
import {
  mountWebGlAuthHandoff,
  readDashboardAccessToken,
  webGlOriginFromBaseUrl,
} from "../auth/launchWebGl";
import { MaterialIcon } from "./MaterialIcon";
import { PinsPanel } from "./PinsPanel";
import { SpaceChatPanel } from "./SpaceChatPanel";

type WebGlEmbedProps = {
  url: string;
  sessionId: string;
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

type PinModalState = Omit<PinNameRequestPayload, "type"> | null;

/**
 * Full-viewport embedded Unity WebGL player with Vellum Enter chrome.
 * Uses embed=1 on the WebGL URL (canvas only inside the iframe).
 */
export function WebGlEmbed({
  url,
  sessionId,
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
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [pinModal, setPinModal] = useState<PinModalState>(null);
  const [pinDraft, setPinDraft] = useState("");

  useEffect(() => {
    document.documentElement.classList.add("vr-immersive");
    return () => document.documentElement.classList.remove("vr-immersive");
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    const webGlOrigin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
    if (!iframe || !webGlOrigin) return;

    const attach = () => {
      const win = iframe.contentWindow;
      if (!win) return undefined;
      const cleanupAuth = mountWebGlAuthHandoff({
        target: win,
        webGlOrigin,
        accessToken: readDashboardAccessToken(),
        email,
      });
      const cleanupPin = mountWebGlPinHandoff({
        iframe,
        webGlOrigin,
        onRequest: (payload) => {
          setPinModal(payload);
          setPinDraft(payload.currentLabel ?? "");
        },
      });
      return () => {
        cleanupAuth?.();
        cleanupPin();
      };
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

  const navBadge = chatUnread > 0 ? chatUnread : 0;

  const closePinModal = (result: { label?: string; cancelled?: boolean }) => {
    const iframe = iframeRef.current;
    const webGlOrigin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
    if (iframe && webGlOrigin) {
      postPinNameResult(iframe, webGlOrigin, result);
    }
    setPinModal(null);
    setPinDraft("");
  };

  const onPinSubmit = (e: FormEvent) => {
    e.preventDefault();
    const label = pinDraft.trim() || "Pin";
    closePinModal({ label });
  };

  return (
    <div className="vr-enter-3d">
      <iframe
        ref={iframeRef}
        className="vr-enter-3d__frame"
        src={url}
        title="Vellum Rift 3D experience"
        allow="fullscreen; autoplay"
      />

      {pinModal ? (
        <div className="vr-pin-modal" role="dialog" aria-modal="true" aria-labelledby="vr-pin-modal-title">
          <form className="vr-pin-modal__card" onSubmit={onPinSubmit}>
            <h3 id="vr-pin-modal-title">
              {pinModal.mode === "rename" ? "Rename pin" : "Name this pin"}
            </h3>
            <input
              className="vr-pin-modal__input"
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value)}
              maxLength={256}
              autoFocus
              aria-label="Pin name"
            />
            <div className="vr-pin-modal__actions">
              <button
                type="button"
                className="vr-btn vr-btn--ghost"
                onClick={() => closePinModal({ cancelled: true })}
              >
                Cancel
              </button>
              <button type="submit" className="vr-btn vr-btn--primary">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}

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

        {navCollapsed ? (
          <button
            type="button"
            className="vr-shell-tab vr-shell-tab--nav"
            onClick={() => setNavCollapsed(false)}
            aria-label={navBadge ? `Open menu (${navBadge} chat notifications)` : "Open menu"}
          >
            <MaterialIcon name="menu" />
            {navBadge > 0 ? (
              <span className="vr-shell-tab__badge" aria-hidden="true">
                {navBadge > 9 ? "9+" : navBadge}
              </span>
            ) : null}
          </button>
        ) : (
          <aside className="vr-enter-3d__nav glass-panel vr-shell-panel--open" aria-label="Space menu">
            <div className="vr-enter-3d__nav-head">
              <MaterialIcon name="hub" />
              <h3>Menu</h3>
              <button
                type="button"
                className="vr-shell-panel__collapse"
                onClick={() => setNavCollapsed(true)}
                aria-label="Collapse menu"
              >
                <MaterialIcon name="chevron_left" />
              </button>
            </div>
            <nav className="vr-enter-3d__nav-links">
              <button type="button" className="vr-enter-3d__nav-link" onClick={onExit}>
                <MaterialIcon name="arrow_back" />
                Back to lobby
              </button>
              <button type="button" className="vr-enter-3d__nav-link" onClick={onLeaveSession}>
                <MaterialIcon name="logout" />
                Leave session
              </button>
            </nav>
            <PinsPanel sessionId={sessionId} localPlayerId={me?.playerId ?? null} />
            <p className="vr-enter-3d__nav-meta">
              Signed in as <strong>{email || "Guest"}</strong>
            </p>
          </aside>
        )}

        <SpaceChatPanel
          className="vr-enter-3d__chat glass-panel"
          messages={messages}
          me={me}
          status={status}
          draft={draft}
          onDraftChange={onDraftChange}
          onSubmit={onSend}
          collapsible
          onUnreadChange={setChatUnread}
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
