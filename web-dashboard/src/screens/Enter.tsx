import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { API_BASE_URL } from "../api/config";
import { inviteToSession } from "../api/gameState";
import { MaterialIcon } from "../components/MaterialIcon";
import { useAuth } from "../auth/AuthContext";
import {
  launchWebGlWithAuthHandoff,
  readDashboardAccessToken,
  readDashboardEmail,
  webGlOriginFromBaseUrl,
} from "../auth/launchWebGl";
import { useSessionRoom } from "../hooks/useSessionRoom";
import type { PlayerState } from "../api/gameState";

type EnterProps = {
  sessionId: string | null;
  onLeave: () => void;
  onBrowseSessions: () => void;
};

function displayNameFromEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "Explorer";
  const local = trimmed.split("@")[0]?.trim();
  return local || trimmed;
}

function formatTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function shortSessionLabel(label: string | undefined, sessionId: string): string {
  const name = label?.trim();
  if (name) return name.length > 28 ? `${name.slice(0, 26)}…` : name;
  return sessionId.length > 12 ? `${sessionId.slice(0, 8)}…` : sessionId;
}

function buildWebGlLaunchUrl(
  sessionId: string,
  playerName: string,
  isHost: boolean,
): string | null {
  const base = (import.meta.env.VITE_WEBGL_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  const url = new URL(base.includes("://") ? base : `https://${base}`);
  url.searchParams.set("session", sessionId);
  url.searchParams.set("playerName", playerName);
  url.searchParams.set("isHost", isHost ? "true" : "false");
  url.searchParams.set("backendUrl", API_BASE_URL);
  return url.toString();
}

function buildDesktopCommand(
  sessionId: string,
  playerName: string,
  isHost: boolean,
  accessToken: string | null,
): string {
  const parts = [
    "./VellumRift",
    `-backendUrl=${API_BASE_URL}`,
    `-session=${sessionId}`,
    `-playerName=${playerName}`,
    `-isHost=${isHost ? "true" : "false"}`,
  ];
  if (accessToken) parts.push(`-accessToken=${accessToken}`);
  return parts.join(" ");
}

/** Place avatars on the schematic ring from player positions or a stable hash. */
function avatarStyle(player: PlayerState, index: number, total: number): CSSProperties {
  const hasPos =
    Number.isFinite(player.position?.x) && Number.isFinite(player.position?.z);
  if (hasPos) {
    // Map manuscript-ish coords into the ring (heuristic).
    const nx = Math.max(-1, Math.min(1, player.position.x / 50));
    const nz = Math.max(-1, Math.min(1, player.position.z / 50));
    return {
      left: `${50 + nx * 32}%`,
      top: `${50 + nz * 32}%`,
    };
  }
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const r = 28;
  return {
    left: `${50 + Math.cos(angle) * r}%`,
    top: `${50 + Math.sin(angle) * r}%`,
  };
}

export default function Enter({ sessionId, onLeave, onBrowseSessions }: EnterProps) {
  const { user } = useAuth();
  const displayName = displayNameFromEmail(user?.email ?? "Explorer");
  const { session, messages, me, status, error, sendMessage, retry, players } =
    useSessionRoom(sessionId, displayName);

  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<"invite" | "desktop" | null>(null);
  const [showDesktop, setShowDesktop] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const connectedCount = useMemo(
    () => players.filter((p) => p.isConnected !== false).length || players.length,
    [players],
  );

  const isLive = players.some((p) => p.isConnected);

  const webGlUrl = useMemo(() => {
    if (!sessionId || !me) return null;
    return buildWebGlLaunchUrl(sessionId, me.displayName, me.isHost);
  }, [sessionId, me]);

  const desktopCmd = useMemo(() => {
    if (!sessionId || !me) return "";
    return buildDesktopCommand(
      sessionId,
      me.displayName,
      me.isHost,
      readDashboardAccessToken(),
    );
  }, [sessionId, me]);

  const inviteText = useMemo(() => {
    if (!sessionId) return "";
    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("session", sessionId);
      return url.toString();
    } catch {
      return sessionId;
    }
  }, [sessionId]);

  const copy = async (kind: "invite" | "desktop", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const sendEmailInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionId || !inviteEmail.trim() || inviteBusy) return;
    setInviteBusy(true);
    setInviteStatus(null);
    try {
      const result = await inviteToSession(sessionId, inviteEmail.trim());
      if (result.deliveryStatus === "sent") {
        setInviteStatus(`Invite emailed to ${result.recipientEmail}`);
      } else if (result.deliveryStatus === "skipped") {
        setInviteStatus(
          `Invite saved for ${result.recipientEmail} (email delivery not configured)`,
        );
      } else if (result.deliveryStatus === "failed") {
        setInviteStatus(
          `Invite saved but email failed${result.deliveryError ? `: ${result.deliveryError}` : ""}`,
        );
      } else {
        setInviteStatus(`Invite recorded for ${result.recipientEmail}`);
      }
      setInviteEmail("");
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  };

  const onSend = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    void sendMessage(draft);
    setDraft("");
  };

  const launchWebGl = () => {
    if (!webGlUrl) {
      setShowDesktop(true);
      return;
    }
    const origin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
    if (!origin) {
      window.open(webGlUrl, "vellumRiftWebGL");
      return;
    }
    launchWebGlWithAuthHandoff({
      url: webGlUrl,
      accessToken: readDashboardAccessToken(),
      email: readDashboardEmail() || user?.email || "",
      webGlOrigin: origin,
    });
  };

  if (!sessionId) {
    return (
      <main className="vr-enter">
        <header className="vr-enter__empty-header">
          <h1 className="vr-enter__title">Session Room</h1>
          <p className="vr-enter__lead">
            Pick a session from Exploration Sessions, then Launch to open the loadout lobby —
            presence map, chat, and 3D launch.
          </p>
          <button type="button" className="vr-btn vr-btn--primary" onClick={onBrowseSessions}>
            <MaterialIcon name="hub" />
            Browse sessions
          </button>
        </header>
      </main>
    );
  }

  const label = shortSessionLabel(session?.label, sessionId);

  return (
    <main className="vr-enter">
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
          <form className="vr-enter__invite-form" onSubmit={(e) => void sendEmailInvite(e)}>
            <input
              type="email"
              className="vr-enter__invite-input"
              placeholder="colleague@memphis.edu"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              aria-label="Invite email"
              required
            />
            <button
              type="submit"
              className="vr-enter__text-btn"
              disabled={inviteBusy || !inviteEmail.trim()}
            >
              <MaterialIcon name="mail" />
              {inviteBusy ? "Sending…" : "Email Invite"}
            </button>
          </form>
          <button
            type="button"
            className="vr-enter__text-btn"
            onClick={() => void copy("invite", inviteText)}
            disabled={!inviteText}
          >
            <MaterialIcon name="content_copy" />
            {copied === "invite" ? "Copied" : "Copy Invite"}
          </button>
          <button type="button" className="vr-btn vr-btn--ghost" onClick={onLeave}>
            Leave Session
          </button>
          <button
            type="button"
            className="vr-btn vr-btn--primary"
            onClick={launchWebGl}
            disabled={status !== "ready" || !me}
          >
            <MaterialIcon name="view_in_ar" />
            Enter 3D Experience
          </button>
        </div>
      </header>

      {inviteStatus ? (
        <p className="vr-enter__invite-status" role="status">
          {inviteStatus}
        </p>
      ) : null}

      {error ? (
        <p className="vr-enter__error" role="alert">
          {error}{" "}
          <button type="button" className="vr-enter__retry" onClick={() => void retry()}>
            Retry
          </button>
        </p>
      ) : null}

      {status === "connecting" ? (
        <p className="vr-enter__status">Joining session as {displayName}…</p>
      ) : null}

      <div className="vr-enter__body">
        <section className="vr-enter__map glass-panel" aria-label="Spatial presence">
          <div className="vr-enter__map-head">
            <h2 className="vr-enter__map-title">Spatial Presence</h2>
            <div className="vr-enter__badges">
              <span className={`vr-enter__badge ${isLive ? "vr-enter__badge--live" : ""}`}>
                {isLive ? <span className="vr-enter__pulse" /> : null}
                {isLive ? "Live" : status === "ready" ? "Ready" : "…"}
              </span>
              <span className="vr-enter__badge">
                {connectedCount} Active User{connectedCount === 1 ? "" : "s"}
              </span>
              {me?.isHost ? (
                <span className="vr-enter__badge vr-enter__badge--host">Host</span>
              ) : null}
            </div>
          </div>

          <div className="vr-enter__map-stage">
            <div className="vr-enter__map-dots" aria-hidden="true" />
            <div className="vr-enter__ring vr-enter__ring--outer">
              <div className="vr-enter__ring vr-enter__ring--mid">
                <div className="vr-enter__ring vr-enter__ring--inner">
                  <div className="vr-enter__core">
                    <MaterialIcon name="menu_book" />
                    <span>Manuscript Core</span>
                  </div>
                </div>
              </div>
              {players.map((player, index) => (
                <div
                  key={player.id}
                  className={`vr-enter__avatar${player.isHost ? " vr-enter__avatar--host" : ""}${
                    player.id === me?.playerId ? " vr-enter__avatar--me" : ""
                  }`}
                  style={avatarStyle(player, index, players.length)}
                  title={player.displayName}
                >
                  <span className="vr-enter__avatar-dot" />
                  <span className="vr-enter__avatar-name">
                    {player.id === me?.playerId ? "You" : player.displayName}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="vr-enter__controls-hint" aria-label="Controls">
            <span>
              <kbd>WASD</kbd> Move
            </span>
            <span>
              <kbd>Mouse</kbd> Look
            </span>
            <span>
              <kbd>SPACE</kbd> Interact
            </span>
          </div>

          <div className="vr-enter__launch-row">
            <button
              type="button"
              className="vr-btn vr-btn--primary"
              onClick={launchWebGl}
              disabled={status !== "ready" || !me}
            >
              <MaterialIcon name="view_in_ar" />
              {webGlUrl ? "Enter 3D Experience" : "Launch options"}
            </button>
            <button
              type="button"
              className="vr-btn vr-btn--outline"
              onClick={() => setShowDesktop((v) => !v)}
              disabled={status !== "ready" || !me}
            >
              <MaterialIcon name="desktop_windows" />
              Desktop
            </button>
          </div>

          {showDesktop && me ? (
            <div className="vr-enter__desktop">
              <p>
                Desktop join uses CLI handoff (#128 / #129). Copy and run against your standalone
                build (token included when you are signed in — treat it like a password):
              </p>
              <pre className="vr-enter__code">{desktopCmd}</pre>
              <button
                type="button"
                className="vr-btn vr-btn--ghost"
                onClick={() => void copy("desktop", desktopCmd)}
              >
                <MaterialIcon name="content_copy" />
                {copied === "desktop" ? "Copied" : "Copy command"}
              </button>
              {!webGlUrl ? (
                <p className="vr-enter__hint">
                  Set <code>VITE_WEBGL_BASE_URL</code> to enable one-click WebGL launch.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="vr-enter__chat glass-panel" aria-label="Session chat">
          <div className="vr-enter__chat-head">
            <MaterialIcon name="forum" />
            <h3>Session Chat</h3>
          </div>
          <div className="vr-enter__chat-log">
            {messages.length === 0 ? (
              <p className="vr-enter__chat-empty">No messages yet. Say hello to the room.</p>
            ) : (
              messages.map((m) => {
                const mine = m.playerId === me?.playerId;
                return (
                  <div
                    key={m.id}
                    className={`vr-enter__bubble-wrap${mine ? " vr-enter__bubble-wrap--mine" : ""}`}
                  >
                    <span className="vr-enter__bubble-meta">
                      {formatTime(m.sentAt)}
                      {!mine && !m.system ? ` · ${m.displayName}` : ""}
                    </span>
                    <div
                      className={`vr-enter__bubble${mine ? " vr-enter__bubble--mine" : ""}${
                        m.system ? " vr-enter__bubble--system" : ""
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <form className="vr-enter__chat-compose" onSubmit={onSend}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={me ? "Type a message…" : "Join the session to chat"}
              disabled={!me || status !== "ready"}
              maxLength={500}
              aria-label="Chat message"
            />
            <button type="submit" disabled={!me || status !== "ready" || !draft.trim()}>
              <MaterialIcon name="send" />
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
