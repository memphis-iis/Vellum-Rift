import "../styles/screens/enter.css";
import { useMemo, useState, type FormEvent } from "react";
import type { GameSession } from "../api/gameState";
import {
  buildPrimaryShareUrl,
  formatEventWindow,
  sessionEndsAt,
  sessionExperiencePhase,
  sessionKind,
  sessionStartsAt,
} from "../api/sessionEvent";
import { useAuth } from "../auth/AuthContext";
import { CHAT_ENABLED } from "../auth/config";
import { readDashboardEmail } from "../auth/launchWebGl";
import { MaterialIcon } from "../components/MaterialIcon";
import { SpaceChatPanel } from "../components/SpaceChatPanel";
import { WebGlEmbed } from "../components/WebGlEmbed";
import { HostTools, type HostToolsProps } from "../components/enter/HostTools";
import { LaunchPanel } from "../components/enter/LaunchPanel";
import { Loadout } from "../components/enter/Loadout";
import { PresenceMap } from "../components/enter/PresenceMap";
import { HostNotices, RoomAlerts } from "../components/enter/RoomNotices";
import { TopBar } from "../components/enter/TopBar";
import { displayNameFromEmail, readFlag, shortSessionLabel } from "../components/enter/helpers";
import { useAllowlist } from "../components/enter/useAllowlist";
import { useDemoAdmin } from "../components/enter/useDemoAdmin";
import { useDepthScale } from "../components/enter/useDepthScale";
import { useCopy, useEnterLaunch } from "../components/enter/useEnterLaunch";
import { useHostRunner } from "../components/enter/useHostRunner";
import { useLaunchLinks } from "../components/enter/useLaunchLinks";
import { useModerationActions, useMuseumActions } from "../components/enter/useModerationActions";
import { usePlaylist } from "../components/enter/usePlaylist";
import { useSpaceActions } from "../components/enter/useSpaceActions";
import { useSessionRoom } from "../hooks/useSessionRoom";

type EnterProps = {
  sessionId: string | null;
  onLeave: () => void;
  onBrowseSessions: () => void;
  /** Host CTA: add manuscript via Library with this space preselected. */
  onAddFromLibrary?: (sessionId: string) => void;
};

type RoomProps = EnterProps & { sessionId: string };
type Room = ReturnType<typeof useSessionRoom>;

function useRoomFlags(session: GameSession | null, sessionId: string) {
  const kioskEnabled = readFlag(session, "kioskEnabled");
  const spaceKind = sessionKind(session);
  return {
    kioskEnabled,
    spaceKind,
    visibility: (session?.visibility === "private" ? "private" : "public") as "public" | "private",
    /** Event + kiosk: museum path for respawn / Quest schemes (#322). */
    isMuseumPath: spaceKind === "event" && kioskEnabled,
    experiencePhase: sessionExperiencePhase(session),
    eventWindow: formatEventWindow(sessionStartsAt(session), sessionEndsAt(session)),
    shareUrl: buildPrimaryShareUrl(sessionId, kioskEnabled),
    helpRequests: Array.isArray(session?.helpRequests) ? session.helpRequests : [],
  };
}

type Flags = ReturnType<typeof useRoomFlags>;

function useHostActions(room: Room, flags: Flags, sessionId: string) {
  const isHost = Boolean(room.me?.isHost);
  const { session, applySession, retry } = room;
  const host = useHostRunner({ sessionId, isHost, isMuseumPath: flags.isMuseumPath });
  const space = useSpaceActions({ host, ...flags, applySession, retry });
  const moderation = useModerationActions({ host, session, applySession, retry });
  const museum = useMuseumActions({ host, retry });
  const allowlist = useAllowlist({ host, sessionId, isHost, visibility: flags.visibility });
  const depth = useDepthScale({ sessionId, isHost, session, applySession });
  const demo = useDemoAdmin({ host, session, applySession });
  return { host, space, moderation, museum, allowlist, depth, demo };
}

function useChatDraft(room: Room) {
  const [draft, setDraft] = useState("");
  const onSend = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    void room.sendMessage(draft);
    setDraft("");
  };
  return { draft, setDraft, onSend };
}

function firstNonEmpty(a: string | undefined, b: string | undefined): string {
  return a || b || "";
}

function useRoomView({ sessionId, onLeave, onAddFromLibrary }: RoomProps) {
  const { user } = useAuth();
  const userEmail = user?.email ?? "";
  const displayName = displayNameFromEmail(userEmail || "Learner");
  const room = useSessionRoom(sessionId, displayName);
  const { session, me, applySession } = room;
  const flags = useRoomFlags(session, sessionId);
  const links = useLaunchLinks(sessionId, me, flags.kioskEnabled);
  const playlist = usePlaylist({
    sessionId,
    isHost: Boolean(me?.isHost),
    session,
    applySession,
    setRoomPlaylistBusy: room.setPlaylistBusy,
  });
  const players = room.players;
  const visiblePlayers = useMemo(() => players.filter((p) => p.isConnected !== false), [players]);
  return {
    sessionId,
    onLeave,
    onAddFromLibrary,
    displayName,
    email: firstNonEmpty(readDashboardEmail(), user?.email),
    label: shortSessionLabel(session?.label, sessionId),
    room,
    flags,
    links,
    playlist,
    visiblePlayers,
    isHost: Boolean(me?.isHost),
    launch: useEnterLaunch(links, userEmail),
    copy: useCopy(),
    chat: useChatDraft(room),
    actions: useHostActions(room, flags, sessionId),
    share: useState(false),
  };
}

type View = ReturnType<typeof useRoomView>;

function hostToolsProps(v: View): HostToolsProps {
  return {
    ...v.actions,
    ...v.flags,
    session: v.room.session,
    links: v.links,
    copied: v.copy.copied,
    onCopy: (kind, text) => void v.copy.copy(kind, text),
    hasShareUrl: Boolean(v.flags.shareUrl),
    onOpenShare: () => v.share[1](true),
    visiblePlayers: v.visiblePlayers,
    meId: v.room.me?.playerId,
  };
}

function HostSection({ v }: { v: View }) {
  const tools = hostToolsProps(v);
  return (
    <>
      <HostNotices
        status={v.actions.host.status}
        helpRequests={v.flags.helpRequests}
        busy={v.actions.host.busy}
        onAcknowledge={(id) => void v.actions.moderation.onAckHelp(id)}
        shareUrl={v.flags.shareUrl}
        shareOpen={v.share[0]}
        onShareClose={() => v.share[1](false)}
        kioskEnabled={v.flags.kioskEnabled}
        copied={v.copy.copied}
        onCopy={tools.onCopy}
      />
      <EventWindow v={v} />
      <HostTools {...tools} />
    </>
  );
}

function EventWindow({ v }: { v: View }) {
  if (v.flags.spaceKind !== "event" || !v.flags.eventWindow) return null;
  return (
    <p className="vr-enter__event-window" role="status">
      Event window: {v.flags.eventWindow}
    </p>
  );
}

function VisitorSection({ v }: { v: View }) {
  const { status, session } = v.room;
  return (
    <>
      <EventWindow v={v} />
      {(status === "ready" || session) && v.playlist.activeTitle ? (
        <p className="vr-enter__visitor-now" role="status">
          Now in this space: <strong>{v.playlist.activeTitle}</strong>
        </p>
      ) : null}
    </>
  );
}

function LobbyBody({ v }: { v: View }) {
  const { room, chat } = v;
  const ready = room.status === "ready";
  return (
    <div className="vr-enter__body">
      <PresenceMap
        players={room.players}
        visiblePlayers={v.visiblePlayers}
        meId={room.me?.playerId}
        isHostMe={v.isHost}
        statusLabel={ready ? "Ready" : "…"}
        activeTitle={v.playlist.activeTitle}
      >
        <LaunchPanel
          launch={v.launch}
          links={v.links}
          ready={ready}
          hasPlayer={Boolean(room.me)}
          copied={v.copy.copied}
          onCopy={(kind, text) => void v.copy.copy(kind, text)}
        />
      </PresenceMap>
      {CHAT_ENABLED ? (
        <SpaceChatPanel
          messages={room.messages}
          me={room.me}
          status={room.status}
          draft={chat.draft}
          onDraftChange={chat.setDraft}
          onSubmit={chat.onSend}
        />
      ) : null}
    </div>
  );
}

function Lobby({ v }: { v: View }) {
  const { room } = v;
  return (
    <main className={`vr-enter ${v.isHost ? "vr-enter--host" : "vr-enter--visitor"}`}>
      <TopBar
        label={v.label}
        onLeave={v.onLeave}
        launch={v.launch}
        links={v.links}
        ready={room.status === "ready"}
        hasPlayer={Boolean(room.me)}
      />
      {v.isHost ? <HostSection v={v} /> : <VisitorSection v={v} />}
      {room.status === "ready" || room.session ? (
        <Loadout
          playlist={v.playlist}
          isHost={v.isHost}
          sessionId={v.sessionId}
          onAddFromLibrary={v.onAddFromLibrary}
        />
      ) : null}
      <RoomAlerts
        error={room.error}
        connecting={room.status === "connecting"}
        displayName={v.displayName}
        onRetry={() => void room.retry()}
      />
      <LobbyBody v={v} />
    </main>
  );
}

function Embedded({ v, url }: { v: View; url: string }) {
  const { room, chat, launch } = v;
  return (
    <WebGlEmbed
      url={url}
      sessionId={v.sessionId}
      sessionLabel={v.label}
      email={v.email}
      messages={room.messages}
      me={room.me}
      status={room.status}
      draft={chat.draft}
      onDraftChange={chat.setDraft}
      onSend={chat.onSend}
      onExit={() => launch.setIn3d(false)}
      onLeaveSession={() => {
        launch.setIn3d(false);
        v.onLeave();
      }}
    />
  );
}

function EnterRoom(props: RoomProps) {
  const v = useRoomView(props);
  const embedUrl = v.links.webGlEmbedUrl;
  if (v.launch.in3d && embedUrl) return <Embedded v={v} url={embedUrl} />;
  return <Lobby v={v} />;
}

function EmptyLobby({ onBrowseSessions }: { onBrowseSessions: () => void }) {
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

export default function Enter(props: EnterProps) {
  if (!props.sessionId) return <EmptyLobby onBrowseSessions={props.onBrowseSessions} />;
  return <EnterRoom {...props} sessionId={props.sessionId} />;
}
