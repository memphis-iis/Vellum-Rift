import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { getAuthHeaders } from "../api/authHeaders";
import { API_BASE_URL } from "../api/config";
import {
  addAllowlistEmail,
  fetchAllowlist,
  inviteToSession,
  kickPlayer,
  mutePlayer,
  removeAllowlistEntry,
  setSessionKiosk,
  setSessionVisibility,
  transferHost,
  unmutePlayer,
  type AllowlistEntry,
  type GameSession,
} from "../api/gameState";
import { fetchModelMeta, fetchModels } from "../api/models";
import {
  sessionActiveModelId,
  sessionPlaylist,
  shortModelLabel,
} from "../api/playlistHelpers";
import { patchSessionActiveModel, patchSessionEvent, patchSessionPlaylist } from "../api/sessions";
import { buildWebGlLaunchUrl } from "../api/webGlLaunchUrl";
import { MaterialIcon } from "../components/MaterialIcon";
import { ManuscriptPreview } from "../components/ManuscriptPreview";
import { ShareQrPanel } from "../components/ShareQrPanel";
import { SpaceChatPanel } from "../components/SpaceChatPanel";
import { WebGlEmbed } from "../components/WebGlEmbed";
import { useAuth } from "../auth/AuthContext";
import {
  launchWebGlWithAuthHandoff,
  readDashboardAccessToken,
  readDashboardEmail,
  webGlOriginFromBaseUrl,
} from "../auth/launchWebGl";
import { isKioskAccessToken } from "../auth/config";
import { tryOpenDesktopLaunchUrl } from "../auth/launchDesktop";
import { useModelPreview } from "../hooks/useModelPreview";
import { useSessionRoom } from "../hooks/useSessionRoom";
import type { PlayerState } from "../api/gameState";
import {
  buildPrimaryShareUrl,
  formatEventWindow,
  sessionEndsAt,
  sessionKind,
  sessionStartsAt,
} from "../api/sessionEvent";

type StageLayout = "spotlight" | "even_row" | "surround" | "custom";
type GuestExperience = "host_led" | "browse" | "open_stage";

const STAGE_LAYOUTS: { id: StageLayout; label: string }[] = [
  { id: "spotlight", label: "Spotlight" },
  { id: "even_row", label: "In a row" },
  { id: "surround", label: "Around you" },
  { id: "custom", label: "Custom" },
];

const GUEST_EXPERIENCES: { id: GuestExperience; label: string }[] = [
  { id: "host_led", label: "Host-led" },
  { id: "browse", label: "Browse" },
  { id: "open_stage", label: "Open stage" },
];

function readSessionStage(session: GameSession | null): {
  stageLayout: StageLayout;
  guestExperience: GuestExperience;
} {
  const top = session as
    | (GameSession & { stageLayout?: unknown; guestExperience?: unknown })
    | null;
  const meta = session?.metadata ?? {};
  const layoutRaw = top?.stageLayout ?? meta.stageLayout;
  const expRaw = top?.guestExperience ?? meta.guestExperience;
  const stageLayout =
    typeof layoutRaw === "string" &&
    STAGE_LAYOUTS.some((o) => o.id === layoutRaw)
      ? (layoutRaw as StageLayout)
      : "surround";
  const guestExperience =
    typeof expRaw === "string" &&
    GUEST_EXPERIENCES.some((o) => o.id === expRaw)
      ? (expRaw as GuestExperience)
      : "open_stage";
  return { stageLayout, guestExperience };
}

type EnterProps = {
  sessionId: string | null;
  onLeave: () => void;
  onBrowseSessions: () => void;
  /** Host CTA: add manuscript via Library with this space preselected. */
  onAddFromLibrary?: (sessionId: string) => void;
};

function displayNameFromEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "Learner";
  const local = trimmed.split("@")[0]?.trim();
  return local || trimmed;
}

function shortSessionLabel(label: string | undefined, sessionId: string): string {
  const name = label?.trim();
  if (name) return name.length > 28 ? `${name.slice(0, 26)}…` : name;
  return sessionId.length > 12 ? `${sessionId.slice(0, 8)}…` : sessionId;
}

function buildDesktopCommand(
  sessionId: string,
  playerName: string,
  isHost: boolean,
): string {
  // Never embed live JWTs in Lobby HTML (#266). Desktop app signs in via Bluekey
  // or the one-click protocol handoff (token not shown in the page).
  return [
    "./VellumRift",
    `-backendUrl=${API_BASE_URL}`,
    `-session=${sessionId}`,
    `-playerName=${playerName}`,
    `-isHost=${isHost ? "true" : "false"}`,
  ].join(" ");
}

/** Cap map dots so Spatial Presence stays readable with crowded sessions (#269). */
const MAP_AVATAR_LIMIT = 12;
const MAP_NAME_MAX = 12;

function truncatePresenceName(name: string, max = MAP_NAME_MAX): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

/** Place avatars on the schematic ring from player positions or a stable hash. */
function avatarStyle(player: PlayerState, index: number, total: number): CSSProperties {
  const hasPos =
    Number.isFinite(player.position?.x) && Number.isFinite(player.position?.z);
  if (hasPos) {
    // Map manuscript-ish coords into the ring (heuristic) + light index jitter to unstack.
    const nx = Math.max(-1, Math.min(1, player.position.x / 50));
    const nz = Math.max(-1, Math.min(1, player.position.z / 50));
    const jitter = total > 6 ? ((index % 5) - 2) * 1.2 : 0;
    return {
      left: `${50 + nx * 32 + jitter}%`,
      top: `${50 + nz * 32 + ((index % 3) - 1) * (total > 6 ? 1.1 : 0)}%`,
    };
  }
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const r = total > 8 ? 30 : 28;
  return {
    left: `${50 + Math.cos(angle) * r}%`,
    top: `${50 + Math.sin(angle) * r}%`,
  };
}

export default function Enter({
  sessionId,
  onLeave,
  onBrowseSessions,
  onAddFromLibrary,
}: EnterProps) {
  const { user } = useAuth();
  const displayName = displayNameFromEmail(user?.email ?? "Learner");
  const { session, messages, me, status, error, sendMessage, retry, players, applySession } =
    useSessionRoom(sessionId, displayName);

  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<"invite" | "desktop" | "kiosk" | "share" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [in3d, setIn3d] = useState(false);
  const [showDesktop, setShowDesktop] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [addInviteToAllowlist, setAddInviteToAllowlist] = useState(true);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [allowlistEmail, setAllowlistEmail] = useState("");
  const [hostBusy, setHostBusy] = useState(false);
  const [playlistBusy, setPlaylistBusy] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});
  const [previewModelId, setPreviewModelId] = useState<string | null>(null);

  const isHost = Boolean(me?.isHost);
  const visibility = session?.visibility === "private" ? "private" : "public";
  const kioskEnabled = Boolean(
    session?.kioskEnabled === true || session?.metadata?.kioskEnabled === true,
  );
  const spaceKind = sessionKind(session);
  const eventWindow = formatEventWindow(sessionStartsAt(session), sessionEndsAt(session));
  const primaryShareUrl = sessionId
    ? buildPrimaryShareUrl(sessionId, kioskEnabled)
    : "";

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

  useEffect(() => {
    void fetchModels(200)
      .then((models) => {
        const map: Record<string, string> = {};
        for (const m of models) {
          if (m.modelId) map[m.modelId] = m.label?.trim() || m.modelId;
        }
        setModelLabels(map);
      })
      .catch(() => {
        /* optional */
      });
  }, []);

  const playlist = sessionPlaylist(session as GameSession | null);
  const activeModelId = sessionActiveModelId(session as GameSession | null);
  const activeTitle = activeModelId
    ? shortModelLabel(activeModelId, modelLabels[activeModelId])
    : null;
  const { stageLayout, guestExperience } = readSessionStage(session as GameSession | null);
  const canVisitorCycle =
    !isHost &&
    (guestExperience === "browse" || guestExperience === "open_stage") &&
    playlist.length >= 2;

  useEffect(() => {
    setPreviewModelId(activeModelId);
  }, [activeModelId, sessionId]);

  const loadoutPreview = useModelPreview(previewModelId);

  useEffect(() => {
    if (!playlist.length) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        playlist.map(async (modelId) => {
          try {
            const meta = await fetchModelMeta(modelId);
            if (!cancelled) next[modelId] = meta.label?.trim() || modelId;
          } catch {
            /* optional — fall back to id */
          }
        }),
      );
      if (!cancelled && Object.keys(next).length) {
        setModelLabels((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.join("|")]);

  const onSetActiveModel = async (modelId: string) => {
    if (!sessionId || !isHost || playlistBusy) return;
    setPlaylistBusy(true);
    setPlaylistError(null);
    try {
      const updated = await patchSessionActiveModel(sessionId, modelId);
      applySession(updated as GameSession);
    } catch (err) {
      setPlaylistError(err instanceof Error ? err.message : "Failed to set active manuscript");
    } finally {
      setPlaylistBusy(false);
    }
  };

  const onCycleActiveModel = async (delta: -1 | 1) => {
    if (!sessionId || playlistBusy || playlist.length < 2) return;
    const currentIdx = activeModelId ? playlist.indexOf(activeModelId) : -1;
    const base = currentIdx >= 0 ? currentIdx : 0;
    const nextId = playlist[(base + delta + playlist.length) % playlist.length];
    if (!nextId || nextId === activeModelId) return;
    setPlaylistBusy(true);
    setPlaylistError(null);
    try {
      const updated = await patchSessionActiveModel(sessionId, nextId);
      applySession(updated as GameSession);
    } catch (err) {
      setPlaylistError(err instanceof Error ? err.message : "Failed to switch manuscript");
    } finally {
      setPlaylistBusy(false);
    }
  };

  const onPatchStage = async (patch: {
    stageLayout?: StageLayout;
    guestExperience?: GuestExperience;
  }) => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/game-state/${encodeURIComponent(sessionId)}/stage`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify(patch),
        },
      );
      const data = (await res.json().catch(() => ({}))) as GameSession & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Stage update failed (${res.status})`);
      }
      applySession(data);
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Stage update failed");
    } finally {
      setHostBusy(false);
    }
  };

  const onRemoveFromPlaylist = async (modelId: string) => {
    if (!sessionId || !isHost || playlistBusy) return;
    setPlaylistBusy(true);
    setPlaylistError(null);
    try {
      const updated = await patchSessionPlaylist(sessionId, { remove: modelId });
      applySession(updated as GameSession);
    } catch (err) {
      setPlaylistError(err instanceof Error ? err.message : "Failed to remove manuscript");
    } finally {
      setPlaylistBusy(false);
    }
  };

  const connectedCount = useMemo(
    () => players.filter((p) => p.isConnected !== false).length || players.length,
    [players],
  );

  const presenceMap = useMemo(() => {
    const live = players.filter((p) => p.isConnected !== false);
    const pool = live.length > 0 ? live : players;
    const meId = me?.playerId;
    const ranked = [...pool].sort((a, b) => {
      if (a.id === meId) return -1;
      if (b.id === meId) return 1;
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
    const shown = ranked.slice(0, MAP_AVATAR_LIMIT);
    return {
      shown,
      overflow: Math.max(0, ranked.length - shown.length),
      roster: ranked,
    };
  }, [players, me?.playerId]);

  const isLive = players.some((p) => p.isConnected);

  const accessToken = readDashboardAccessToken();
  const kioskGuest = isKioskAccessToken(accessToken);

  const webGlUrl = useMemo(() => {
    if (!sessionId || !me) return null;
    return buildWebGlLaunchUrl({
      sessionId,
      playerName: me.displayName,
      isHost: me.isHost,
      kiosk: kioskGuest,
    });
  }, [sessionId, me, kioskGuest]);

  const webGlEmbedUrl = useMemo(() => {
    if (!sessionId || !me) return null;
    return buildWebGlLaunchUrl({
      sessionId,
      playerName: me.displayName,
      isHost: me.isHost,
      embed: true,
      kiosk: kioskGuest,
    });
  }, [sessionId, me, kioskGuest]);

  const desktopCmd = useMemo(() => {
    if (!sessionId || !me) return "";
    return buildDesktopCommand(sessionId, me.displayName, me.isHost);
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

  const kioskJoinText = useMemo(() => {
    if (!sessionId) return "";
    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("session", sessionId);
      url.searchParams.set("kiosk", "1");
      return url.toString();
    } catch {
      return sessionId;
    }
  }, [sessionId]);

  const copy = async (kind: "invite" | "desktop" | "kiosk" | "share", text: string) => {
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

  const toggleKiosk = async () => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      const updated = await setSessionKiosk(sessionId, !kioskEnabled);
      applySession(updated);
      setInviteStatus(
        !kioskEnabled
          ? "Kiosk join on — guests can enter without Bluekey via the public link"
          : "Kiosk join off — Bluekey required again",
      );
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Kiosk update failed");
    } finally {
      setHostBusy(false);
    }
  };

  const toggleEventKind = async () => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      const next = spaceKind === "event" ? "exploration" : "event";
      const updated = await patchSessionEvent(sessionId, { kind: next });
      applySession(updated as GameSession);
      setInviteStatus(
        next === "event"
          ? "Marked as event — appears as Featured on Home when active"
          : "Marked as exploration",
      );
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Event update failed");
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
    if (!webGlEmbedUrl) {
      setShowDesktop(true);
      return;
    }
    setIn3d(true);
  };

  const openWebGlNewTab = () => {
    if (!webGlUrl || !me) return;
    const token = readDashboardAccessToken();
    const origin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
    if (!origin) {
      window.open(webGlUrl, "vellumRiftWebGL");
      return;
    }
    // Sync open under click gesture; hand off kiosk or Bluekey token (#267).
    launchWebGlWithAuthHandoff({
      url: webGlUrl,
      accessToken: token,
      email: readDashboardEmail() || user?.email || "",
      webGlOrigin: origin,
    });
  };

  const openDesktopApp = () => {
    if (!sessionId || !me) return;
    const token = readDashboardAccessToken();
    if (!token || isKioskAccessToken(token)) return;
    tryOpenDesktopLaunchUrl({
      sessionId,
      playerName: me.displayName,
      isHost: me.isHost,
      accessToken: token,
      backendUrl: API_BASE_URL,
    });
  };

  if (!sessionId) {
    return (
      <main className="vr-enter">
        <header className="vr-enter__empty-header">
          <h1 className="vr-enter__title">Lobby</h1>
          <p className="vr-enter__lead">
            Pick a space from Spaces, then Launch to open this lobby — presence map, chat, and 3D for
            web or VR.
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

  if (in3d && webGlEmbedUrl) {
    return (
      <WebGlEmbed
        url={webGlEmbedUrl}
        sessionId={sessionId}
        sessionLabel={label}
        email={readDashboardEmail() || user?.email || ""}
        messages={messages}
        me={me}
        status={status}
        draft={draft}
        onDraftChange={setDraft}
        onSend={onSend}
        onExit={() => setIn3d(false)}
        onLeaveSession={() => {
          setIn3d(false);
          onLeave();
        }}
      />
    );
  }

  return (
    <main className={`vr-enter ${isHost ? "vr-enter--host" : "vr-enter--visitor"}`}>
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
          <button
            type="button"
            className="vr-btn vr-btn--primary"
            onClick={launchWebGl}
            disabled={status !== "ready" || !me}
          >
            <MaterialIcon name="view_in_ar" />
            Enter 3D
          </button>
        </div>
      </header>

      {inviteStatus && isHost ? (
        <p className="vr-enter__invite-status" role="status">
          {inviteStatus}
        </p>
      ) : null}

      {spaceKind === "event" && eventWindow ? (
        <p className="vr-enter__event-window" role="status">
          Event window: {eventWindow}
        </p>
      ) : null}

      {isHost && primaryShareUrl ? (
        <ShareQrPanel
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          url={primaryShareUrl}
          title={kioskEnabled ? "Kiosk / public join" : "Share invite link"}
          hint={
            kioskEnabled
              ? "Guests open this without Bluekey. Turn Kiosk off to share a signed-in invite instead."
              : "Signed-in colleagues use this link. Enable Kiosk for a museum QR without Bluekey."
          }
          onCopy={() => void copy("share", primaryShareUrl)}
          copied={copied === "share"}
        />
      ) : null}

      {!isHost && (status === "ready" || session) && activeTitle ? (
        <p className="vr-enter__visitor-now" role="status">
          Now in this space: <strong>{activeTitle}</strong>
        </p>
      ) : null}

      {playlistError && !isHost ? (
        <p className="vr-enter__error" role="alert">
          {playlistError}
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
              {presenceMap.overflow > 0 ? (
                <span className="vr-enter__badge" title="Additional guests shown in the roster">
                  +{presenceMap.overflow} more
                </span>
              ) : null}
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
                    <span>{activeTitle ?? "Learning space"}</span>
                  </div>
                </div>
              </div>
              {presenceMap.shown.map((player, index) => (
                <div
                  key={player.id}
                  className={`vr-enter__avatar${player.isHost ? " vr-enter__avatar--host" : ""}${
                    player.id === me?.playerId ? " vr-enter__avatar--me" : ""
                  }`}
                  style={avatarStyle(player, index, presenceMap.shown.length)}
                  title={player.displayName}
                >
                  <span className="vr-enter__avatar-dot" />
                  <span className="vr-enter__avatar-name">
                    {player.id === me?.playerId
                      ? "You"
                      : truncatePresenceName(player.displayName)}
                  </span>
                </div>
              ))}
              {presenceMap.overflow > 0 ? (
                <div
                  className="vr-enter__avatar vr-enter__avatar--overflow"
                  style={{ left: "50%", top: "86%" }}
                  title={`${presenceMap.overflow} more in roster`}
                >
                  <span className="vr-enter__avatar-dot" />
                  <span className="vr-enter__avatar-name">+{presenceMap.overflow}</span>
                </div>
              ) : null}
            </div>
          </div>

          {presenceMap.roster.length > 0 ? (
            <ul className="vr-enter__roster" aria-label="People in this space">
              {presenceMap.roster.map((player) => (
                <li
                  key={player.id}
                  className={`vr-enter__roster-chip${
                    player.id === me?.playerId ? " vr-enter__roster-chip--me" : ""
                  }${player.isHost ? " vr-enter__roster-chip--host" : ""}`}
                  title={player.displayName}
                >
                  {player.id === me?.playerId
                    ? "You"
                    : truncatePresenceName(player.displayName, 18)}
                  {player.isHost ? " · Host" : ""}
                </li>
              ))}
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
              <kbd>LMB</kbd> Laser
            </span>
            <span>
              <kbd>L</kbd> Light
            </span>
            <span>
              <kbd>[</kbd>
              <kbd>]</kbd> Manuscript
            </span>
            <span>
              <kbd>Esc</kbd> Leave
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
              {webGlEmbedUrl ? "Enter 3D" : "Launch options"}
            </button>
            {webGlUrl ? (
              <button
                type="button"
                className="vr-btn vr-btn--outline"
                onClick={openWebGlNewTab}
                disabled={status !== "ready" || !me}
              >
                <MaterialIcon name="open_in_new" />
                New tab
              </button>
            ) : null}
            {!kioskGuest ? (
              <button
                type="button"
                className="vr-btn vr-btn--outline"
                onClick={() => setShowDesktop((v) => !v)}
                disabled={status !== "ready" || !me}
              >
                <MaterialIcon name="desktop_windows" />
                Desktop
              </button>
            ) : null}
          </div>

          {showDesktop && me && !kioskGuest ? (
            <div className="vr-enter__desktop">
              <p>
                Open the desktop client with a one-click handoff, or copy the CLI without embedding
                your sign-in token in this page (#266).
              </p>
              <button
                type="button"
                className="vr-btn vr-btn--primary"
                onClick={openDesktopApp}
                disabled={!readDashboardAccessToken()}
              >
                <MaterialIcon name="desktop_windows" />
                Open desktop app
              </button>
              <pre className="vr-enter__code">{desktopCmd}</pre>
              <button
                type="button"
                className="vr-btn vr-btn--ghost"
                onClick={() => void copy("desktop", desktopCmd)}
              >
                <MaterialIcon name="content_copy" />
                {copied === "desktop" ? "Copied" : "Copy CLI (no token)"}
              </button>
              <p className="vr-enter__hint">
                The CLI omits <code>-accessToken</code>. Sign in with Bluekey inside the desktop
                app, or use Open desktop app for protocol handoff.
              </p>
              {!webGlUrl ? (
                <p className="vr-enter__hint">
                  Set <code>VITE_WEBGL_BASE_URL</code> to enable one-click WebGL launch.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <SpaceChatPanel
          messages={messages}
          me={me}
          status={status}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={onSend}
        />
      </div>

      {/* Host tools + manuscripts stay below the enter/presence viewport (#242). */}
      <div className="vr-enter__below-fold">
      {isHost ? (
        <details className="vr-enter__host-ops">
          <summary className="vr-enter__host-ops-summary">
            <MaterialIcon name="admin_panel_settings" />
            Host tools
            <span className="vr-enter__host-ops-hint">
              Stage, visibility, kiosk, invites, participants
            </span>
          </summary>

          <section className="vr-enter__stage-controls" aria-label="Stage controls">
            <div className="vr-enter__stage-row">
              <span className="vr-enter__stage-label">Stage layout</span>
              <div className="vr-enter__stage-chips" role="group" aria-label="Stage layout">
                {STAGE_LAYOUTS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`vr-enter__stage-chip${
                      stageLayout === opt.id ? " vr-enter__stage-chip--active" : ""
                    }`}
                    aria-pressed={stageLayout === opt.id}
                    disabled={hostBusy}
                    onClick={() => void onPatchStage({ stageLayout: opt.id })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="vr-enter__stage-row">
              <span className="vr-enter__stage-label">Guest experience</span>
              <div className="vr-enter__stage-chips" role="group" aria-label="Guest experience">
                {GUEST_EXPERIENCES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`vr-enter__stage-chip${
                      guestExperience === opt.id ? " vr-enter__stage-chip--active" : ""
                    }`}
                    aria-pressed={guestExperience === opt.id}
                    disabled={hostBusy}
                    onClick={() => void onPatchStage({ guestExperience: opt.id })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="vr-enter__host-ops-toolbar">
            <button
              type="button"
              className="vr-enter__text-btn"
              onClick={() => void toggleVisibility()}
              disabled={hostBusy}
            >
              <MaterialIcon name={visibility === "private" ? "lock" : "public"} />
              {visibility === "private" ? "Private" : "Public"}
            </button>
            <button
              type="button"
              className="vr-enter__text-btn"
              onClick={() => void toggleEventKind()}
              disabled={hostBusy}
              title="Feature this space as an event on Home"
            >
              <MaterialIcon name={spaceKind === "event" ? "event_available" : "event"} />
              {spaceKind === "event" ? "Event" : "Exploration"}
            </button>
            <button
              type="button"
              className="vr-enter__text-btn"
              onClick={() => void toggleKiosk()}
              disabled={hostBusy}
              title="Let museum guests join without Bluekey"
            >
              <MaterialIcon name={kioskEnabled ? "storefront" : "store"} />
              {kioskEnabled ? "Kiosk on" : "Kiosk off"}
            </button>
            {kioskEnabled ? (
              <button
                type="button"
                className="vr-enter__text-btn"
                onClick={() => void copy("kiosk", kioskJoinText)}
                disabled={!kioskJoinText}
              >
                <MaterialIcon name="qr_code_2" />
                {copied === "kiosk" ? "Copied" : "Copy kiosk link"}
              </button>
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
            {primaryShareUrl ? (
              <button
                type="button"
                className="vr-enter__text-btn"
                onClick={() => setShareOpen(true)}
              >
                <MaterialIcon name="qr_code_2" />
                Share QR
              </button>
            ) : null}
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
          </div>

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

          <section className="vr-enter__moderation" aria-label="Participant moderation">
            <h2 className="vr-enter__playlist-title">
              <MaterialIcon name="group" />
              Participants
            </h2>
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
          </section>
        </details>
      ) : null}

      {status === "ready" || session ? (
        <details className="vr-enter__loadout">
          <summary className="vr-enter__loadout-summary">
            <MaterialIcon name="menu_book" />
            Manuscripts
            {activeTitle ? (
              <span className="vr-enter__loadout-hint">Active: {activeTitle}</span>
            ) : null}
          </summary>
          {canVisitorCycle ? (
            <div className="vr-enter__visitor-cycle" role="group" aria-label="Browse manuscripts">
              <button
                type="button"
                className="vr-btn vr-btn--outline"
                disabled={playlistBusy}
                onClick={() => void onCycleActiveModel(-1)}
              >
                <MaterialIcon name="chevron_left" />
                Previous
              </button>
              <button
                type="button"
                className="vr-btn vr-btn--outline"
                disabled={playlistBusy}
                onClick={() => void onCycleActiveModel(1)}
              >
                Next
                <MaterialIcon name="chevron_right" />
              </button>
            </div>
          ) : null}
          <div className="vr-enter__loadout-grid">
            <ManuscriptPreview
              className="vr-enter__loadout-preview"
              preview={loadoutPreview}
              emptyMessage={
                playlist.length
                  ? "Select a manuscript in the list to preview its mesh."
                  : "No manuscripts in this space yet — nothing to preview."
              }
              alt={
                previewModelId
                  ? shortModelLabel(previewModelId, modelLabels[previewModelId])
                  : undefined
              }
            />
            <div className="vr-enter__playlist vr-enter__playlist--loadout">
              <div className="vr-enter__playlist-head">
                <h2 className="vr-enter__playlist-title">
                  <MaterialIcon name="menu_book" />
                  Loadout
                </h2>
                {isHost && sessionId && onAddFromLibrary ? (
                  <button
                    type="button"
                    className="vr-enter__text-btn"
                    onClick={() => onAddFromLibrary(sessionId)}
                    disabled={playlistBusy}
                  >
                    <MaterialIcon name="library_add" />
                    Add from library
                  </button>
                ) : null}
              </div>
              {playlistError && isHost ? (
                <p className="vr-enter__error" role="alert">
                  {playlistError}
                </p>
              ) : null}
              {!playlist.length ? (
                <p className="vr-enter__playlist-empty">
                  {isHost
                    ? "No documents in this space yet."
                    : "No manuscripts in this exhibit yet."}
                  {isHost && onAddFromLibrary && sessionId ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="vr-enter__retry"
                        onClick={() => onAddFromLibrary(sessionId)}
                      >
                        Add from library
                      </button>
                    </>
                  ) : null}
                </p>
              ) : (
                <ul className="vr-enter__playlist-list">
                  {playlist.map((modelId) => {
                    const isActive = modelId === activeModelId;
                    const isPreviewing = modelId === previewModelId;
                    const title = shortModelLabel(modelId, modelLabels[modelId]);
                    return (
                      <li
                        key={modelId}
                        className={`vr-enter__playlist-row${isActive ? " vr-enter__playlist-row--active" : ""}${
                          isPreviewing ? " vr-enter__playlist-row--previewing" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className="vr-enter__playlist-select"
                          title={modelId}
                          aria-pressed={isPreviewing}
                          onClick={() => setPreviewModelId(modelId)}
                        >
                          {isActive ? (
                            <MaterialIcon name="check_circle" className="vr-enter__playlist-check" />
                          ) : (
                            <MaterialIcon name="radio_button_unchecked" />
                          )}
                          <span className="vr-enter__playlist-name">{title}</span>
                          {isActive ? (
                            <span className="vr-enter__playlist-badge">Active</span>
                          ) : null}
                        </button>
                        {isHost ? (
                          <span className="vr-enter__playlist-actions">
                            {!isActive ? (
                              <button
                                type="button"
                                className="vr-enter__text-btn"
                                disabled={playlistBusy}
                                onClick={() => void onSetActiveModel(modelId)}
                              >
                                Set active
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="vr-enter__text-btn"
                              disabled={playlistBusy}
                              onClick={() => void onRemoveFromPlaylist(modelId)}
                            >
                              Remove
                            </button>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {!isHost && playlist.length ? (
                <p className="vr-enter__playlist-hint">
                  Tap a manuscript to preview. Enter 3D uses the active one.
                </p>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
      </div>
    </main>
  );
}
