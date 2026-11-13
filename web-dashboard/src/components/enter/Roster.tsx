import { useId } from "react";
import type { ControlSchemeId, PlayerState } from "../../api/gameState";
import { MaterialIcon } from "../MaterialIcon";
import type { useModerationActions, useMuseumActions } from "./useModerationActions";

type Moderation = ReturnType<typeof useModerationActions>;
type Museum = ReturnType<typeof useMuseumActions>;

type RosterProps = {
  players: PlayerState[];
  meId: string | undefined;
  busy: boolean;
  isMuseumPath: boolean;
  moderation: Moderation;
  museum: Museum;
};

type RowProps = {
  player: PlayerState;
  isMe: boolean;
  busy: boolean;
  isMuseumPath: boolean;
  moderation: Moderation;
  museum: Museum;
};

function MuseumControls({ player, busy, museum }: Pick<RowProps, "player" | "busy" | "museum">) {
  const selectId = useId();
  const scheme: ControlSchemeId =
    player.controlScheme === "splitLaserJetpack" ? "splitLaserJetpack" : "default";
  return (
    <>
      <button
        type="button"
        className="vr-enter__text-btn"
        disabled={busy}
        onClick={() => void museum.onRespawn(player.id)}
        title="Teleport to asset-facing spawn"
      >
        Respawn
      </button>
      <span className="vr-enter__scheme-label">
        <label htmlFor={selectId} className="vr-enter__scheme-label-text">
          Quest
        </label>
        <select
          id={selectId}
          className="vr-enter__scheme-select"
          value={scheme}
          disabled={busy}
          aria-label={`Quest control scheme for ${player.displayName}`}
          onChange={(e) => void museum.onControlScheme(player.id, e.target.value as ControlSchemeId)}
        >
          <option value="default">Quest: Default</option>
          <option value="splitLaserJetpack">Quest: Laser+Jetpack</option>
        </select>
      </span>
    </>
  );
}

function ModerationControls({ player, busy, moderation }: Pick<RowProps, "player" | "busy" | "moderation">) {
  return (
    <>
      <button
        type="button"
        className="vr-enter__text-btn"
        disabled={busy}
        onClick={() => void moderation.onMuteToggle(player.id, Boolean(player.chatMuted))}
      >
        {player.chatMuted ? "Unmute" : "Mute"}
      </button>
      <button
        type="button"
        className="vr-enter__text-btn"
        disabled={busy}
        onClick={() => void moderation.onMakeHost(player.id)}
      >
        Make host
      </button>
      <button
        type="button"
        className="vr-enter__text-btn"
        disabled={busy}
        onClick={() => void moderation.onKick(player.id)}
      >
        Kick
      </button>
    </>
  );
}

function RosterRow(props: RowProps) {
  const { player, isMe } = props;
  const canModerate = !player.isHost && !isMe;
  return (
    <li className="vr-enter__roster-row">
      <span className="vr-enter__roster-name">
        {isMe ? "You" : player.displayName}
        {player.isHost ? " · host" : ""}
        {player.chatMuted ? " · muted" : ""}
      </span>
      <span className="vr-enter__roster-actions">
        {props.isMuseumPath ? <MuseumControls {...props} /> : null}
        {canModerate ? <ModerationControls {...props} /> : null}
      </span>
    </li>
  );
}

function MuseumBar({ busy, museum }: Pick<RowProps, "busy" | "museum">) {
  return (
    <div className="vr-enter__roster-museum-bar">
      <button
        type="button"
        className="vr-enter__text-btn"
        disabled={busy}
        onClick={() => void museum.onRespawnAll()}
        title="Teleport all connected players to asset-facing spawn"
      >
        Respawn all
      </button>
      <span className="vr-enter__host-ops-hint">
        Quest schemes apply on headset only - laptop controls stay unchanged
      </span>
    </div>
  );
}

export function Roster({ players, meId, ...rest }: RosterProps) {
  return (
    <section className="vr-enter__moderation" aria-label="Participant moderation">
      <h2 className="vr-enter__playlist-title">
        <MaterialIcon name="group" />
        Participants
      </h2>
      {rest.isMuseumPath ? <MuseumBar busy={rest.busy} museum={rest.museum} /> : null}
      <ul className="vr-enter__roster" aria-label="Participants">
        {players.map((player) => (
          <RosterRow key={player.id} player={player} isMe={player.id === meId} {...rest} />
        ))}
      </ul>
    </section>
  );
}
