import type { ReactNode } from "react";
import type { PlayerState } from "../../api/gameState";
import { MaterialIcon } from "../MaterialIcon";
import { avatarStyle } from "./helpers";

type PresenceMapProps = {
  players: PlayerState[];
  visiblePlayers: PlayerState[];
  meId: string | undefined;
  isHostMe: boolean;
  statusLabel: string;
  activeTitle: string | null;
};

function Badges({ live, statusLabel, count, isHostMe }: {
  live: boolean;
  statusLabel: string;
  count: number;
  isHostMe: boolean;
}) {
  return (
    <div className="vr-enter__badges">
      <span className={`vr-enter__badge ${live ? "vr-enter__badge--live" : ""}`}>
        {live ? <span className="vr-enter__pulse" /> : null}
        {live ? "Live" : statusLabel}
      </span>
      <span className="vr-enter__badge">
        {count} Active User{count === 1 ? "" : "s"}
      </span>
      {isHostMe ? <span className="vr-enter__badge vr-enter__badge--host">Host</span> : null}
    </div>
  );
}

function Avatar({ player, index, total, isMe }: {
  player: PlayerState;
  index: number;
  total: number;
  isMe: boolean;
}) {
  const cls = `vr-enter__avatar${player.isHost ? " vr-enter__avatar--host" : ""}${
    isMe ? " vr-enter__avatar--me" : ""
  }`;
  return (
    <div className={cls} style={avatarStyle(player, index, total)} title={player.displayName}>
      <span className="vr-enter__avatar-dot" />
      <span className="vr-enter__avatar-name">{isMe ? "You" : player.displayName}</span>
    </div>
  );
}

function MapStage({ players, visiblePlayers, meId, activeTitle }: Omit<PresenceMapProps, "isHostMe" | "statusLabel">) {
  return (
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
          <Avatar
            key={player.id}
            player={player}
            index={index}
            total={players.length}
            isMe={player.id === meId}
          />
        ))}
      </div>
    </div>
  );
}

function ControlsHint() {
  return (
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
  );
}

type MapProps = PresenceMapProps & { children?: ReactNode };

export function PresenceMap({ children, ...props }: MapProps) {
  const live = props.visiblePlayers.some((p) => p.isConnected);
  return (
    <section className="vr-enter__map glass-panel" aria-label="Spatial presence">
      <div className="vr-enter__map-head">
        <h2 className="vr-enter__map-title">Spatial Presence</h2>
        <Badges
          live={live}
          statusLabel={props.statusLabel}
          count={props.visiblePlayers.length}
          isHostMe={props.isHostMe}
        />
      </div>
      <MapStage {...props} />
      <ControlsHint />
      {children}
    </section>
  );
}
