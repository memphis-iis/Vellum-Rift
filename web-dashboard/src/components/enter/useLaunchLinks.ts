import { useMemo } from "react";
import type { LocalIdentity } from "../../hooks/useSessionRoom";
import { buildWebGlLaunchUrl } from "../../api/webGlLaunchUrl";
import { readDashboardAccessToken } from "../../auth/launchWebGl";
import { buildDesktopCommand, sessionLink } from "./helpers";

type Me = LocalIdentity | null | undefined;

export type LaunchLinks = {
  webGlUrl: string | null;
  webGlEmbedUrl: string | null;
  observerUrl: string | null;
  desktopCmd: string;
  inviteText: string;
  kioskJoinText: string;
  observerLinkText: string;
};

function usePlayerUrls(sessionId: string | null, me: Me, kioskEnabled: boolean) {
  const player = me
    ? {
        playerName: me.displayName,
        isHost: me.isHost,
        playerId: me.playerId,
        connectionId: me.connectionId,
      }
    : null;
  return useMemo(() => {
    if (!sessionId || !player) return { webGlUrl: null, webGlEmbedUrl: null, observerUrl: null };
    return {
      webGlUrl: buildWebGlLaunchUrl({ sessionId, ...player }),
      webGlEmbedUrl: buildWebGlLaunchUrl({ sessionId, ...player, embed: true }),
      observerUrl: buildWebGlLaunchUrl({
        sessionId,
        playerName: player.playerName,
        isHost: false,
        spectator: true,
        kiosk: kioskEnabled,
      }),
    };
    // `player` is derived from `me`; depend on the source value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, me, kioskEnabled]);
}

export function useLaunchLinks(sessionId: string | null, me: Me, kioskEnabled: boolean): LaunchLinks {
  const urls = usePlayerUrls(sessionId, me, kioskEnabled);
  const { observerUrl } = urls;

  return useMemo(() => {
    const desktopCmd =
      sessionId && me
        ? buildDesktopCommand({
            sessionId,
            playerName: me.displayName,
            isHost: me.isHost,
            accessToken: readDashboardAccessToken(),
            playerId: me.playerId,
          })
        : "";
    const link = (extra?: Record<string, string>) => (sessionId ? sessionLink(sessionId, extra) : "");
    return {
      ...urls,
      desktopCmd,
      inviteText: link(),
      kioskJoinText: link({ kiosk: "1" }),
      observerLinkText: observerUrl ?? link({ observer: "1" }),
    };
  }, [sessionId, me, urls, observerUrl]);
}
