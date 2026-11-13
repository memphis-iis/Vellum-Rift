import {
  acknowledgeHelpRequest,
  kickPlayer,
  mutePlayer,
  respawnAllPlayers,
  respawnPlayer,
  setPlayerControlScheme,
  transferHost,
  unmutePlayer,
  type ControlSchemeId,
  type GameSession,
} from "../../api/gameState";
import type { HostRunner } from "./useHostRunner";

type ModerationContext = {
  host: HostRunner;
  session: GameSession | null;
  applySession: (session: GameSession) => void;
  retry: () => Promise<void>;
};

export function useModerationActions({ host, session, applySession, retry }: ModerationContext) {
  const onKick = (playerId: string) =>
    host.act("Kick failed", async (id) => {
      await kickPlayer(id, playerId);
      await retry();
      return "Player removed";
    });

  const onMakeHost = (playerId: string) =>
    host.act("Host transfer failed", async (id) => {
      await transferHost(id, playerId);
      await retry();
      return "Host transferred";
    });

  const onMuteToggle = (playerId: string, muted: boolean) =>
    host.act("Mute update failed", async (id) => {
      if (muted) await unmutePlayer(id, playerId);
      else await mutePlayer(id, playerId);
      await retry();
    });

  const onAckHelp = (requestId: string) =>
    host.act("Could not acknowledge help request", async (id) => {
      const result = await acknowledgeHelpRequest(id, requestId);
      if (session) applySession({ ...session, helpRequests: result.helpRequests });
    });

  return { onKick, onMakeHost, onMuteToggle, onAckHelp };
}

export function useMuseumActions({ host, retry }: Pick<ModerationContext, "host" | "retry">) {
  const museum = { museum: true };

  const onRespawn = (playerId: string) =>
    host.act(
      "Respawn failed",
      async (id) => {
        await respawnPlayer(id, playerId);
        await retry();
        return "Player respawned at asset";
      },
      museum,
    );

  const onRespawnAll = () =>
    host.act(
      "Respawn all failed",
      async (id) => {
        const result = await respawnAllPlayers(id);
        await retry();
        return `Respawned ${result.count} player(s) at asset`;
      },
      museum,
    );

  const onControlScheme = (playerId: string, scheme: ControlSchemeId) =>
    host.act(
      "Control scheme update failed",
      async (id) => {
        await setPlayerControlScheme(id, playerId, scheme);
        await retry();
        return scheme === "splitLaserJetpack" ? "Quest scheme: Laser+Jetpack" : "Quest scheme: Default";
      },
      museum,
    );

  return { onRespawn, onRespawnAll, onControlScheme };
}
