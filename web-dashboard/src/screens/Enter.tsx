import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { API_BASE_URL } from "../api/config";
import {
  addAllowlistEmail,
  fetchAllowlist,
  inviteToSession,
  kickPlayer,
  mutePlayer,
  removeAllowlistEntry,
  setSessionVisibility,
  transferHost,
  unmutePlayer,
  type AllowlistEntry,
} from "../api/gameState";
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
  if (!trimmed) return "Learner";
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
  const displayName = displayNameFromEmail(user?.email ?? "Learner");
  const { session, messages, me, status, error, sendMessage, retry, players } =
    useSessionRoom(sessionId, displayName);

  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<"invite" | "desktop" | null>(null);
  const [showDesktop, setShowDesktop] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [addInviteToAllowlist, setAddInviteToAllowlist] = useState(true);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [allowlistEmail, setAllowlistEmail] = useState("");
  const [hostBusy, setHostBusy] = useState(false);

  const isHost = Boolean(me?.isHost);
  const visibility = session?.visibility === "private" ? "private" : "public";

  useEffect(() => {
    setAddInviteToAllowlist(visibility === "private");
  }, [visibility]);

  useEffect(() => {
    if (!sessionId || !isHost) {
      setAllowlist([]);
      return;
    }
    let cancelled = false;
    void fetchAllowlist(sessionId)
      .then((entries) => {
        if (!cancelled) setAllowlist(entries);
      })
      .catch(() => {
        if (!cancelled) setAllowlist([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isHost]);

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
    if (!sessionId || !inviteEmail.trim() || inviteBusy || !isHost) return;
    setInviteBusy(true);
    setInviteStatus(null);
    try {
      const result = await inviteToSession(sessionId, inviteEmail.trim(), {
        addToAllowlist: addInviteToAllowlist,
      });
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
      if (addInviteToAllowlist) {
        setAllowlist(await fetchAllowlist(sessionId));
      }
      setInviteEmail("");
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  };

  const toggleVisibility = async () => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      const next = visibility === "private" ? "public" : "private";
      await setSessionVisibility(sessionId, next);
      await retry();
      setInviteStatus(`Space is now ${next}`);
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Visibility update failed");
    } finally {
      setHostBusy(false);
    }
  };

  const onAddAllowlist = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionId || !isHost || !allowlistEmail.trim() || hostBusy) return;
    setHostBusy(true);
    try {
      await addAllowlistEmail(sessionId, allowlistEmail.trim());
      setAllowlist(await fetchAllowlist(sessionId));
      setAllowlistEmail("");
      setInviteStatus(`Added ${allowlistEmail.trim()} to allowlist`);
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Allowlist add failed");
    } finally {
      setHostBusy(false);
    }
  };

  const onRemoveAllowlist = async (entryId: string) => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      await removeAllowlistEntry(sessionId, entryId);
      setAllowlist(await fetchAllowlist(sessionId));
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Allowlist remove failed");
    } finally {
      setHostBusy(false);
    }
  };

  const refreshRoom = async () => {
    await retry();
  };

  const onKick = async (playerId: string) => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      await kickPlayer(sessionId, playerId);
      await refreshRoom();
      setInviteStatus("Player removed");
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Kick failed");
    } finally {
      setHostBusy(false);
    }
  };

  const onMuteToggle = async (playerId: string, muted: boolean) => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      if (muted) await unmutePlayer(sessionId, playerId);
      else await mutePlayer(sessionId, playerId);
      await refreshRoom();
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Mute update failed");
    } finally {
      setHostBusy(false);
    }
  };

  const onMakeHost = async (playerId: string) => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      await transferHost(sessionId, playerId);
      await refreshRoom();
      setInviteStatus("Host transferred");
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Host transfer failed");
    } finally {
      setHostBusy(false);
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
          <h1 className="vr-enter__title">Space room</h1>
          <p className="vr-enter__lead">
            Pick a learning space from Spaces, then Launch to open the lobby — presence map, chat, and
            3D launch for web or VR.
          </p>
          <button type="button" className="vr-btn vr-btn--primary" onClick={onBrowseSessions}>
            <MaterialIcon name="hub" />
            Browse spaces
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
          {isHost ? (
            <>
              <button
                type="button"
                className="vr-enter__text-btn"
                onClick={() => void toggleVisibility()}
                disabled={hostBusy}
              >
                <MaterialIcon name={visibility === "private" ? "lock" : "public"} />
                {visibility === "private" ? "Private" : "Public"}
              </button>
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
                <label className="vr-enter__allowlist-check">
                  <input
                    type="checkbox"
                    checked={addInviteToAllowlist}
                    onChange={(e) => setAddInviteToAllowlist(e.target.checked)}
                  />
                  Allowlist
                </label>
                <button
                  type="submit"
                  className="vr-enter__text-btn"
                  disabled={inviteBusy || !inviteEmail.trim()}
                >
                  <MaterialIcon name="mail" />
                  {inviteBusy ? "Sending…" : "Email Invite"}
                </button>
              </form>
            </>
          ) : null}
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
            Leave space
          </button>
          <button
            type="button"
            className="vr-btn vr-btn--primary"
            onClick={launchWebGl}
            disabled={status !== "ready" || !me}
          >
            <MaterialIcon name="view_in_ar" />
            Enter 3D space
          </button>
        </div>
      </header>

      {inviteStatus ? (
        <p className="vr-enter__invite-status" role="status">
          {inviteStatus}
        </p>
      ) : null}

      {isHost ? (
        <section className="vr-enter__allowlist" aria-label="Space allowlist">
          <form className="vr-enter__invite-form" onSubmit={(e) => void onAddAllowlist(e)}>
            <span className="vr-enter__allowlist-label">Allowlist</span>
            <input
              type="email"
              className="vr-enter__invite-input"
              placeholder="add@memphis.edu"
              value={allowlistEmail}
              onChange={(e) => setAllowlistEmail(e.target.value)}
              aria-label="Allowlist email"
            />
            <button
              type="submit"
              className="vr-enter__text-btn"
              disabled={hostBusy || !allowlistEmail.trim()}
            >
              <MaterialIcon name="person_add" />
              Add
            </button>
          </form>
          {allowlist.length ? (
            <ul className="vr-enter__allowlist-list">
              {allowlist.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.email || entry.subjectSub || "entry"}</span>
                  <button
                    type="button"
                    className="vr-enter__text-btn"
                    onClick={() => void onRemoveAllowlist(entry.id)}
                    disabled={hostBusy}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vr-enter__allowlist-empty">
              {visibility === "private"
                ? "Private space — add emails (or check Allowlist on invite)."
                : "Optional allowlist (used if you switch to Private)."}
            </p>
          )}
        </section>
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
        <p className="vr-enter__status">Joining space as {displayName}…</p>
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
                    <span>Learning space</span>
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

          {isHost ? (
            <ul className="vr-enter__roster" aria-label="Participants">
              {players.map((player) => {
                const isMe = player.id === me?.playerId;
                const canModerate = !player.isHost && !isMe;
                return (
                  <li key={player.id} className="vr-enter__roster-row">
                    <span className="vr-enter__roster-name">
                      {isMe ? "You" : player.displayName}
                      {player.isHost ? " · host" : ""}
                      {player.chatMuted ? " · muted" : ""}
                    </span>
                    {canModerate ? (
                      <span className="vr-enter__roster-actions">
                        <button
                          type="button"
                          className="vr-enter__text-btn"
                          disabled={hostBusy}
                          onClick={() => void onMuteToggle(player.id, Boolean(player.chatMuted))}
                        >
                          {player.chatMuted ? "Unmute" : "Mute"}
                        </button>
                        <button
                          type="button"
                          className="vr-enter__text-btn"
                          disabled={hostBusy}
                          onClick={() => void onMakeHost(player.id)}
                        >
                          Make host
                        </button>
                        <button
                          type="button"
                          className="vr-enter__text-btn"
                          disabled={hostBusy}
                          onClick={() => void onKick(player.id)}
                        >
                          Kick
                        </button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

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
              {webGlUrl ? "Enter 3D space" : "Launch options"}
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

        <aside className="vr-enter__chat glass-panel" aria-label="Space chat">
          <div className="vr-enter__chat-head">
            <MaterialIcon name="forum" />
            <h3>Space chat</h3>
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
              placeholder={me ? "Type a message…" : "Join the space to chat"}
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
