import "../styles/screens/enter.css";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { API_BASE_URL } from "../api/config";
import {
  acknowledgeHelpRequest,
  addAllowlistEmail,
  fetchAllowlist,
  inviteToSession,
  kickPlayer,
  mutePlayer,
  removeAllowlistEntry,
  respawnAllPlayers,
  respawnPlayer,
  setPlayerControlScheme,
  setSessionDemo,
  setSessionKiosk,
  setSessionVisibility,
  transferHost,
  unmutePlayer,
  type AllowlistEntry,
  type ControlSchemeId,
  type GameSession,
  type HelpRequest,
} from "../api/gameState";
import { fetchDemoAdminStatus } from "../api/demos";
import { fetchModelMeta, fetchModels } from "../api/models";
import {
  sessionActiveModelId,
  sessionPlaylist,
  shortModelLabel,
} from "../api/playlistHelpers";
import {
  patchSessionActiveModel,
  patchSessionDepthScale,
  patchSessionPlaylist,
} from "../api/sessions";
import { buildWebGlLaunchUrl } from "../api/webGlLaunchUrl";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStatus } from "../components/StatusRegion";
import { TurnCountdown } from "../components/TurnCountdown";
import { ManuscriptPreview } from "../components/ManuscriptPreview";
import { ShareQrPanel } from "../components/ShareQrPanel";
import { SpaceChatPanel } from "../components/SpaceChatPanel";
import { CHAT_ENABLED } from "../auth/config";
import { WebGlEmbed } from "../components/WebGlEmbed";
import { useAuth } from "../auth/AuthContext";
import {
  launchWebGlWithAuthHandoff,
  readDashboardAccessToken,
  readDashboardEmail,
  webGlOriginFromBaseUrl,
} from "../auth/launchWebGl";
import { useModelPreview } from "../hooks/useModelPreview";
import { useSessionRoom } from "../hooks/useSessionRoom";
import type { PlayerState } from "../api/gameState";
import {
  patchSessionEvent,
  patchSessionRotation,
  ROTATION_MINUTE_PRESETS,
  type RotationMinutes,
} from "../api/sessions";
import {
  buildPrimaryShareUrl,
  formatEventWindow,
  sessionEndsAt,
  sessionExperiencePhase,
  sessionKind,
  sessionStartsAt,
} from "../api/sessionEvent";

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

function formatHelpRequestTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  accessToken: string | null,
  playerId?: string | null,
): string {
  const parts = [
    "./VellumRift",
    `-backendUrl=${API_BASE_URL}`,
    `-session=${sessionId}`,
    `-playerName=${playerName}`,
    `-isHost=${isHost ? "true" : "false"}`,
  ];
  if (playerId) parts.push(`-playerId=${playerId}`);
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

export default function Enter({
  sessionId,
  onLeave,
  onBrowseSessions,
  onAddFromLibrary,
}: EnterProps) {
  const { user } = useAuth();
  const displayName = displayNameFromEmail(user?.email ?? "Learner");
  const {
    session,
    messages,
    me,
    status,
    error,
    sendMessage,
    retry,
    players,
    applySession,
    setPlaylistBusy: setRoomPlaylistBusy,
  } = useSessionRoom(sessionId, displayName);

  const toast = useStatus();
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<"invite" | "desktop" | "kiosk" | "share" | "observer" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [in3d, setIn3d] = useState(false);
  const [enterMode, setEnterMode] = useState<"play" | "observer">(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("observer") === "1" || params.get("mode") === "observer") return "observer";
    } catch {
      /* ignore */
    }
    return "play";
  });
  const [showDesktop, setShowDesktop] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [addInviteToAllowlist, setAddInviteToAllowlist] = useState(true);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [allowlistEmail, setAllowlistEmail] = useState("");
  const [hostBusy, setHostBusy] = useState(false);
  const [isDemoAdmin, setIsDemoAdmin] = useState(false);
  const [demoCategoryDraft, setDemoCategoryDraft] = useState("Examples");
  const [demoSummaryDraft, setDemoSummaryDraft] = useState("");
  const [playlistBusy, setPlaylistBusy] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [depthDraft, setDepthDraft] = useState(1);
  const [depthBusy, setDepthBusy] = useState(false);
  const [depthError, setDepthError] = useState<string | null>(null);
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});
  const [previewModelId, setPreviewModelId] = useState<string | null>(null);

  const isHost = Boolean(me?.isHost);
  const pendingHelpRequests = useMemo((): HelpRequest[] => {
    const raw = session?.helpRequests;
    return Array.isArray(raw) ? raw : [];
  }, [session?.helpRequests]);
  const visibility = session?.visibility === "private" ? "private" : "public";
  const kioskEnabled = Boolean(
    session?.kioskEnabled === true || session?.metadata?.kioskEnabled === true,
  );
  const sessionDepthScale = (() => {
    const top = session?.depthScale;
    if (typeof top === "number" && Number.isFinite(top)) return Math.min(5, Math.max(0, top));
    const meta = session?.metadata?.depthScale;
    if (typeof meta === "number" && Number.isFinite(meta)) return Math.min(5, Math.max(0, meta));
    return 1;
  })();
  const demoEnabled = Boolean(
    session?.demoEnabled === true || session?.metadata?.demoEnabled === true,
  );
  const spaceKind = sessionKind(session);
  /** Event + kiosk: museum path for respawn / Quest schemes (#322). */
  const isMuseumPath = spaceKind === "event" && kioskEnabled;
  const eventWindow = formatEventWindow(sessionStartsAt(session), sessionEndsAt(session));
  const primaryShareUrl = sessionId
    ? buildPrimaryShareUrl(sessionId, kioskEnabled)
    : "";
  const experiencePhase = sessionExperiencePhase(session);

  useEffect(() => {
    setAddInviteToAllowlist(visibility === "private");
  }, [visibility]);

  useEffect(() => {
    let cancelled = false;
    void fetchDemoAdminStatus()
      .then((ok) => {
        if (!cancelled) setIsDemoAdmin(ok);
      })
      .catch(() => {
        if (!cancelled) setIsDemoAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cat =
      (typeof session?.demoCategory === "string" && session.demoCategory.trim()) ||
      (typeof session?.metadata?.demoCategory === "string" &&
        String(session.metadata.demoCategory).trim()) ||
      "Examples";
    const summary =
      (typeof session?.demoSummary === "string" && session.demoSummary) ||
      (typeof session?.metadata?.demoSummary === "string"
        ? String(session.metadata.demoSummary)
        : "");
    setDemoCategoryDraft(cat);
    setDemoSummaryDraft(summary);
  }, [session?.demoCategory, session?.demoSummary, session?.metadata, session?.sessionId]);

  useEffect(() => {
    if (depthBusy) return;
    setDepthDraft(sessionDepthScale);
  }, [sessionDepthScale, session?.sessionId, depthBusy]);

  useEffect(() => {
    if (!sessionId || !isHost) return;
    if (Math.abs(depthDraft - sessionDepthScale) < 0.001) return;
    const timer = window.setTimeout(() => {
      setDepthBusy(true);
      setDepthError(null);
      void patchSessionDepthScale(sessionId, depthDraft)
        .then((updated) => {
          applySession(updated as GameSession);
        })
        .catch((err: unknown) => {
          setDepthError(err instanceof Error ? err.message : "Depth update failed");
          setDepthDraft(sessionDepthScale);
        })
        .finally(() => setDepthBusy(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [depthDraft, sessionId, isHost, sessionDepthScale, applySession]);

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
    setRoomPlaylistBusy(true);
    setPlaylistError(null);
    try {
      const updated = await patchSessionActiveModel(sessionId, modelId);
      applySession(updated as GameSession);
    } catch (err) {
      setPlaylistError(err instanceof Error ? err.message : "Failed to set active asset");
    } finally {
      setPlaylistBusy(false);
      setRoomPlaylistBusy(false);
    }
  };

  const onRemoveFromPlaylist = async (modelId: string) => {
    if (!sessionId || !isHost || playlistBusy) return;
    setPlaylistBusy(true);
    setRoomPlaylistBusy(true);
    setPlaylistError(null);
    try {
      const updated = await patchSessionPlaylist(sessionId, { remove: modelId });
      applySession(updated as GameSession);
    } catch (err) {
      setPlaylistError(err instanceof Error ? err.message : "Failed to remove asset");
    } finally {
      setPlaylistBusy(false);
      setRoomPlaylistBusy(false);
    }
  };

  /** Live roster: hide disconnected ghosts (stale hosts, closed Gallery tabs). */
  const visiblePlayers = useMemo(
    () => players.filter((p) => p && p.isConnected !== false),
    [players],
  );

  const connectedCount = useMemo(() => visiblePlayers.length, [visiblePlayers]);

  const isLive = useMemo(() => visiblePlayers.some((p) => p.isConnected), [visiblePlayers]);

  const webGlUrl = useMemo(() => {
    if (!sessionId || !me) return null;
    return buildWebGlLaunchUrl({
      sessionId,
      playerName: me.displayName,
      isHost: me.isHost,
      playerId: me.playerId,
      connectionId: me.connectionId,
    });
  }, [sessionId, me]);

  const webGlEmbedUrl = useMemo(() => {
    if (!sessionId || !me) return null;
    return buildWebGlLaunchUrl({
      sessionId,
      playerName: me.displayName,
      isHost: me.isHost,
      playerId: me.playerId,
      connectionId: me.connectionId,
      embed: true,
    });
  }, [sessionId, me]);

  const observerUrl = useMemo(() => {
    if (!sessionId || !me) return null;
    return buildWebGlLaunchUrl({
      sessionId,
      playerName: me.displayName,
      isHost: false,
      spectator: true,
      kiosk: kioskEnabled,
    });
  }, [sessionId, me, kioskEnabled]);

  // Any Lobby user with a WebGL base URL can open the museum wall display.
  const canUseObserver = Boolean(observerUrl);

  const desktopCmd = useMemo(() => {
    if (!sessionId || !me) return "";
    return buildDesktopCommand(
      sessionId,
      me.displayName,
      me.isHost,
      readDashboardAccessToken(),
      me.playerId,
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

  const observerLinkText = useMemo(() => {
    if (observerUrl) return observerUrl;
    if (!sessionId) return "";
    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("session", sessionId);
      url.searchParams.set("observer", "1");
      return url.toString();
    } catch {
      return sessionId;
    }
  }, [observerUrl, sessionId]);

  useEffect(() => {
    if (!observerUrl && enterMode === "observer") setEnterMode("play");
  }, [observerUrl, enterMode]);

  const copy = async (
    kind: "invite" | "desktop" | "kiosk" | "share" | "observer",
    text: string,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
      toast.announce("Copied to clipboard.");
    } catch {
      toast.alert("Could not copy. Select the text and copy it manually.");
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
          ? "Kiosk join on - guests can enter without Bluekey via the public link"
          : "Kiosk join off - Bluekey required again",
      );
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Kiosk update failed");
    } finally {
      setHostBusy(false);
    }
  };

  const saveDemoCatalog = async (enabled: boolean) => {
    if (!sessionId || !isDemoAdmin || hostBusy) return;
    setHostBusy(true);
    try {
      const updated = await setSessionDemo(sessionId, {
        enabled,
        category: demoCategoryDraft.trim() || "Examples",
        summary: demoSummaryDraft.trim(),
      });
      applySession(updated);
      setInviteStatus(
        enabled
          ? "Published to Try now / Demos (kiosk enabled for guests)"
          : "Removed from Try now / Demos",
      );
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Demo catalog update failed");
    } finally {
      setHostBusy(false);
    }
  };

  const startTurn = async (minutes: RotationMinutes) => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      const updated = await patchSessionRotation(sessionId, {
        experiencePhase: "playing",
        rotationMinutes: minutes,
      });
      applySession(updated as GameSession);
      setInviteStatus(`Turn started - ${minutes} min`);
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Could not start turn");
    } finally {
      setHostBusy(false);
    }
  };

  const resetTurn = async () => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      const updated = await patchSessionRotation(sessionId, { experiencePhase: "ended" });
      applySession(updated as GameSession);
      setInviteStatus("Turn reset - experience ended");
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Could not reset turn");
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
          ? "Marked as event - appears as Featured on Home when active"
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

  const onAckHelp = async (requestId: string) => {
    if (!sessionId || !isHost || hostBusy) return;
    setHostBusy(true);
    try {
      const result = await acknowledgeHelpRequest(sessionId, requestId);
      if (session) applySession({ ...session, helpRequests: result.helpRequests });
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Could not acknowledge help request");
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

  const onRespawn = async (playerId: string) => {
    if (!sessionId || !isHost || !isMuseumPath || hostBusy) return;
    setHostBusy(true);
    try {
      await respawnPlayer(sessionId, playerId);
      await refreshRoom();
      setInviteStatus("Player respawned at asset");
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Respawn failed");
    } finally {
      setHostBusy(false);
    }
  };

  const onRespawnAll = async () => {
    if (!sessionId || !isHost || !isMuseumPath || hostBusy) return;
    setHostBusy(true);
    try {
      const result = await respawnAllPlayers(sessionId);
      await refreshRoom();
      setInviteStatus(`Respawned ${result.count} player(s) at asset`);
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Respawn all failed");
    } finally {
      setHostBusy(false);
    }
  };

  const onControlScheme = async (playerId: string, scheme: ControlSchemeId) => {
    if (!sessionId || !isHost || !isMuseumPath || hostBusy) return;
    setHostBusy(true);
    try {
      await setPlayerControlScheme(sessionId, playerId, scheme);
      await refreshRoom();
      setInviteStatus(
        scheme === "splitLaserJetpack"
          ? "Quest scheme: Laser+Jetpack"
          : "Quest scheme: Default",
      );
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : "Control scheme update failed");
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

  const openWebGlUrl = (url: string | null) => {
    if (!url) return;
    const origin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
    if (!origin) {
      window.open(url, "vellumRiftWebGL");
      return;
    }
    launchWebGlWithAuthHandoff({
      url,
      accessToken: readDashboardAccessToken(),
      email: readDashboardEmail() || user?.email || "",
      webGlOrigin: origin,
    });
  };

  const launchWebGl = () => {
    if (enterMode === "observer") {
      if (!observerUrl) {
        setShowDesktop(true);
        return;
      }
      openWebGlUrl(observerUrl);
      return;
    }
    if (!webGlEmbedUrl) {
      setShowDesktop(true);
      return;
    }
    setIn3d(true);
  };

  const openWebGlNewTab = () => {
    openWebGlUrl(enterMode === "observer" ? observerUrl : webGlUrl);
  };

  if (!sessionId) {
    return (
      <main className="vr-enter">
        <header className="vr-enter__empty-header">
          <h1 className="vr-enter__title">Lobby</h1>
          <p className="vr-enter__lead">
            Pick a space from Spaces, then Launch to open this lobby - presence map, chat, and 3D for
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
          {canUseObserver ? (
            <div className="vr-enter__mode" role="group" aria-label="Enter mode">
              <button
                type="button"
                className={`vr-enter__mode-btn${enterMode === "play" ? " is-active" : ""}`}
                onClick={() => setEnterMode("play")}
                aria-pressed={enterMode === "play"}
              >
                Play
              </button>
              <button
                type="button"
                className={`vr-enter__mode-btn${enterMode === "observer" ? " is-active" : ""}`}
                onClick={() => setEnterMode("observer")}
                aria-pressed={enterMode === "observer"}
                title="Museum wall - auto camera, chat, radar"
              >
                Observer
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="vr-btn vr-btn--primary vr-enter__launch"
            onClick={launchWebGl}
            disabled={
              status !== "ready" ||
              !me ||
              (enterMode === "observer" ? !observerUrl : !webGlEmbedUrl && !webGlUrl)
            }
          >
            <MaterialIcon name={enterMode === "observer" ? "tv" : "view_in_ar"} />
            {enterMode === "observer" ? "Open display" : "Enter 3D"}
          </button>
        </div>
      </header>

      {inviteStatus && isHost ? (
        <p className="vr-enter__invite-status" role="status">
          {inviteStatus}
        </p>
      ) : null}

      {isHost && pendingHelpRequests.length > 0 ? (
        <section className="vr-enter__help-banner" role="alert" aria-live="polite">
          <div className="vr-enter__help-banner-head">
            <MaterialIcon name="support_agent" />
            <strong>Call for help</strong>
          </div>
          <ul className="vr-enter__help-banner-list">
            {pendingHelpRequests.map((req) => (
              <li key={req.id} className="vr-enter__help-banner-item">
                <span>
                  {req.playerName}{" "}
                  <time dateTime={req.createdAt}>{formatHelpRequestTime(req.createdAt)}</time>
                </span>
                <button
                  type="button"
                  className="vr-btn vr-btn--primary vr-enter__help-ack"
                  disabled={hostBusy}
                  onClick={() => void onAckHelp(req.id)}
                >
                  Acknowledge
                </button>
              </li>
            ))}
          </ul>
        </section>
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

      {isHost ? (
        <details className="vr-enter__host-ops">
          <summary className="vr-enter__host-ops-summary">
            <MaterialIcon name="admin_panel_settings" />
            Host tools
            <span className="vr-enter__host-ops-hint">Space · Share</span>
          </summary>

          <div className="vr-enter__host-ops-toolbar">
            <div className="vr-enter__host-ops-row" role="group" aria-label="Space settings">
              <span className="vr-enter__host-ops-row-label">Space</span>
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
            </div>

            <div className="vr-enter__host-ops-row" role="group" aria-label="Share">
              <span className="vr-enter__host-ops-row-label">Share</span>
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
              {canUseObserver && observerLinkText ? (
                <button
                  type="button"
                  className="vr-enter__text-btn"
                  onClick={() => void copy("observer", observerLinkText)}
                  title="Full-screen museum wall WebGL link"
                >
                  <MaterialIcon name="tv" />
                  {copied === "observer" ? "Copied" : "Copy observer link"}
                </button>
              ) : null}
              <button
                type="button"
                className="vr-enter__text-btn"
                onClick={() => void copy("invite", inviteText)}
                disabled={!inviteText}
              >
                <MaterialIcon name="content_copy" />
                {copied === "invite" ? "Copied" : "Copy invite"}
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
                  {inviteBusy ? "Sending…" : "Email invite"}
                </button>
              </form>
            </div>
          </div>

          <details className="vr-enter__host-more">
            <summary className="vr-enter__host-more-summary">More host options</summary>

            <div className="vr-enter__host-more-body">
              <label className="vr-enter__depth" title="Live Z relief on Quest / WebGL / desktop">
                <span className="vr-enter__depth-label">
                  <MaterialIcon name="height" />
                  Depth
                </span>
                <input
                  type="range"
                  className="vr-enter__depth-range"
                  min={0}
                  max={5}
                  step={0.05}
                  value={depthDraft}
                  disabled={depthBusy}
                  onChange={(e) => setDepthDraft(Number(e.target.value))}
                  aria-valuetext={`${depthDraft.toFixed(2)}×`}
                />
                <span className="vr-enter__depth-value">{depthDraft.toFixed(2)}×</span>
              </label>
              {depthError ? <p className="vr-enter__depth-error">{depthError}</p> : null}
              {isDemoAdmin ? (
                <section className="vr-enter__demo-admin" aria-label="Try now demo catalog">
                  <p className="vr-enter__demo-admin-title">
                    <MaterialIcon name="auto_awesome" />
                    Try now catalog
                  </p>
                  <label className="vr-enter__demo-field">
                    <span>Category</span>
                    <input
                      list="vr-demo-categories"
                      className="vr-enter__invite-input"
                      value={demoCategoryDraft}
                      onChange={(e) => setDemoCategoryDraft(e.target.value)}
                      maxLength={64}
                      disabled={hostBusy}
                    />
                    <datalist id="vr-demo-categories">
                      <option value="Manuscripts" />
                      <option value="Medieval" />
                      <option value="Forgery" />
                      <option value="Handwriting" />
                      <option value="Examples" />
                    </datalist>
                  </label>
                  <label className="vr-enter__demo-field">
                    <span>Summary</span>
                    <input
                      className="vr-enter__invite-input"
                      value={demoSummaryDraft}
                      onChange={(e) => setDemoSummaryDraft(e.target.value)}
                      maxLength={280}
                      placeholder="Short blurb for the catalog"
                      disabled={hostBusy}
                    />
                  </label>
                  <div className="vr-enter__demo-actions">
                    <button
                      type="button"
                      className="vr-enter__text-btn"
                      onClick={() => void saveDemoCatalog(true)}
                      disabled={hostBusy}
                      title="Requires a playlist; enables kiosk for guests"
                    >
                      <MaterialIcon name={demoEnabled ? "published_with_changes" : "publish"} />
                      {demoEnabled ? "Update demo" : "Publish as demo"}
                    </button>
                    {demoEnabled ? (
                      <button
                        type="button"
                        className="vr-enter__text-btn"
                        onClick={() => void saveDemoCatalog(false)}
                        disabled={hostBusy}
                      >
                        <MaterialIcon name="unpublished" />
                        Unpublish
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}
              <section className="vr-enter__turn-timer" aria-label="Turn timer">
                <span className="vr-enter__turn-label">Turn timer</span>
                {ROTATION_MINUTE_PRESETS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className="vr-enter__text-btn"
                    onClick={() => void startTurn(minutes)}
                    disabled={hostBusy}
                    title={`Start a ${minutes}-minute turn`}
                  >
                    <MaterialIcon name="timer" />
                    {minutes} min
                  </button>
                ))}
                <TurnCountdown session={session} ticking={isHost} />
                <button
                  type="button"
                  className="vr-btn vr-btn--primary vr-enter__turn-reset"
                  onClick={() => void resetTurn()}
                  disabled={hostBusy || experiencePhase === "ended"}
                  title="End the current turn and reset the experience"
                >
                  <MaterialIcon name="restart_alt" />
                  Reset
                </button>
              </section>

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
                      ? "Private space - add emails (or check Allowlist on invite)."
                      : "Optional allowlist (used if you switch to Private)."}
                  </p>
                )}
              </section>

              <section className="vr-enter__moderation" aria-label="Participant moderation">
                <h2 className="vr-enter__playlist-title">
                  <MaterialIcon name="group" />
                  Participants
                </h2>
                {isMuseumPath ? (
                  <div className="vr-enter__roster-museum-bar">
                    <button
                      type="button"
                      className="vr-enter__text-btn"
                      disabled={hostBusy}
                      onClick={() => void onRespawnAll()}
                      title="Teleport all connected players to asset-facing spawn"
                    >
                      Respawn all
                    </button>
                    <span className="vr-enter__host-ops-hint">
                      Quest schemes apply on headset only - laptop controls stay unchanged
                    </span>
                  </div>
                ) : null}
                <ul className="vr-enter__roster" aria-label="Participants">
                  {visiblePlayers.map((player) => {
                    const isMe = player.id === me?.playerId;
                    const canModerate = !player.isHost && !isMe;
                    const scheme: ControlSchemeId =
                      player.controlScheme === "splitLaserJetpack"
                        ? "splitLaserJetpack"
                        : "default";
                    return (
                      <li key={player.id} className="vr-enter__roster-row">
                        <span className="vr-enter__roster-name">
                          {isMe ? "You" : player.displayName}
                          {player.isHost ? " · host" : ""}
                          {player.chatMuted ? " · muted" : ""}
                        </span>
                        <span className="vr-enter__roster-actions">
                          {isMuseumPath ? (
                            <>
                              <button
                                type="button"
                                className="vr-enter__text-btn"
                                disabled={hostBusy}
                                onClick={() => void onRespawn(player.id)}
                                title="Teleport to asset-facing spawn"
                              >
                                Respawn
                              </button>
                              <label className="vr-enter__scheme-label">
                                <span className="vr-enter__scheme-label-text">Quest</span>
                                <select
                                  className="vr-enter__scheme-select"
                                  value={scheme}
                                  disabled={hostBusy}
                                  aria-label={`Quest control scheme for ${player.displayName}`}
                                  onChange={(e) =>
                                    void onControlScheme(
                                      player.id,
                                      e.target.value as ControlSchemeId,
                                    )
                                  }
                                >
                                  <option value="default">Quest: Default</option>
                                  <option value="splitLaserJetpack">Quest: Laser+Jetpack</option>
                                </select>
                              </label>
                            </>
                          ) : null}
                          {canModerate ? (
                            <>
                              <button
                                type="button"
                                className="vr-enter__text-btn"
                                disabled={hostBusy}
                                onClick={() =>
                                  void onMuteToggle(player.id, Boolean(player.chatMuted))
                                }
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
                            </>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </details>
        </details>
      ) : null}

      {(status === "ready" || session) ? (
        <details className="vr-enter__loadout">
          <summary className="vr-enter__loadout-summary">
            <MaterialIcon name="menu_book" />
            Assets
            <span className="vr-enter__host-ops-hint">
              {playlist.length
                ? `${playlist.length} in space${activeTitle ? ` · Active: ${activeTitle}` : ""}`
                : "None yet"}
            </span>
            {isHost && sessionId && onAddFromLibrary ? (
              <button
                type="button"
                className="vr-enter__text-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddFromLibrary(sessionId);
                }}
                disabled={playlistBusy}
              >
                <MaterialIcon name="library_add" />
                Add from library
              </button>
            ) : null}
          </summary>
          <div className="vr-enter__loadout-body">
            <div className="vr-enter__loadout-grid">
              <ManuscriptPreview
                className="vr-enter__loadout-preview"
                preview={loadoutPreview}
                emptyMessage={
                  playlist.length
                    ? "Select an asset in the list to preview its mesh."
                    : "No assets in this space yet. Nothing to preview."
                }
                alt={
                  previewModelId
                    ? shortModelLabel(previewModelId, modelLabels[previewModelId])
                    : undefined
                }
              />
              <div className="vr-enter__playlist vr-enter__playlist--loadout">
              {playlistError ? (
                <p className="vr-enter__error" role="alert">
                  {playlistError}
                </p>
              ) : null}
              {!playlist.length ? (
                <p className="vr-enter__playlist-empty">
                  {isHost
                    ? "No documents in this space yet."
                    : "No assets in this exhibit yet."}
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
                  Tap an asset to preview. Enter 3D uses the active one.
                </p>
              ) : null}
            </div>
            </div>
          </div>
        </details>
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
                    <span>{activeTitle ?? "Learning space"}</span>
                  </div>
                </div>
              </div>
              {visiblePlayers.map((player, index) => (
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
            {canUseObserver ? (
              <div className="vr-enter__mode" role="group" aria-label="Enter mode">
                <button
                  type="button"
                  className={`vr-enter__mode-btn${enterMode === "play" ? " is-active" : ""}`}
                  onClick={() => setEnterMode("play")}
                  aria-pressed={enterMode === "play"}
                >
                  Play
                </button>
                <button
                  type="button"
                  className={`vr-enter__mode-btn${enterMode === "observer" ? " is-active" : ""}`}
                  onClick={() => setEnterMode("observer")}
                  aria-pressed={enterMode === "observer"}
                >
                  Observer
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="vr-btn vr-btn--primary"
              onClick={launchWebGl}
              disabled={
                status !== "ready" ||
                !me ||
                (enterMode === "observer" ? !observerUrl : !webGlEmbedUrl && !webGlUrl)
              }
            >
              <MaterialIcon name={enterMode === "observer" ? "tv" : "view_in_ar"} />
              {enterMode === "observer"
                ? observerUrl
                  ? "Open display"
                  : "Launch options"
                : webGlEmbedUrl
                  ? "Enter 3D"
                  : "Launch options"}
            </button>
            {(enterMode === "observer" ? observerUrl : webGlUrl) ? (
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
                build (token included when you are signed in - treat it like a password):
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

        {CHAT_ENABLED ? (
          <SpaceChatPanel
          messages={messages}
          me={me}
          status={status}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={onSend}
        />
        ) : null}
      </div>
    </main>
  );
}
