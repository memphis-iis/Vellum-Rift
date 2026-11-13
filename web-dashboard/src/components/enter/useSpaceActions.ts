import {
  setSessionKiosk,
  setSessionVisibility,
  type GameSession,
} from "../../api/gameState";
import { patchSessionEvent, patchSessionRotation, type RotationMinutes } from "../../api/sessions";
import type { HostRunner } from "./useHostRunner";

type SpaceContext = {
  host: HostRunner;
  visibility: "public" | "private";
  kioskEnabled: boolean;
  spaceKind: string;
  applySession: (session: GameSession) => void;
  retry: () => Promise<void>;
};

export function useSpaceActions(ctx: SpaceContext) {
  const { host, visibility, kioskEnabled, spaceKind, applySession, retry } = ctx;

  const toggleVisibility = () =>
    host.act("Visibility update failed", async (id) => {
      const next = visibility === "private" ? "public" : "private";
      await setSessionVisibility(id, next);
      await retry();
      return `Space is now ${next}`;
    });

  const toggleKiosk = () =>
    host.act("Kiosk update failed", async (id) => {
      applySession(await setSessionKiosk(id, !kioskEnabled));
      return !kioskEnabled
        ? "Kiosk join on - guests can enter without Bluekey via the public link"
        : "Kiosk join off - Bluekey required again";
    });

  const toggleEventKind = () =>
    host.act("Event update failed", async (id) => {
      const next = spaceKind === "event" ? "exploration" : "event";
      applySession((await patchSessionEvent(id, { kind: next })) as GameSession);
      return next === "event"
        ? "Marked as event - appears as Featured on Home when active"
        : "Marked as exploration";
    });

  const startTurn = (minutes: RotationMinutes) =>
    host.act("Could not start turn", async (id) => {
      const updated = await patchSessionRotation(id, {
        experiencePhase: "playing",
        rotationMinutes: minutes,
      });
      applySession(updated as GameSession);
      return `Turn started - ${minutes} min`;
    });

  const resetTurn = () =>
    host.act("Could not reset turn", async (id) => {
      applySession((await patchSessionRotation(id, { experiencePhase: "ended" })) as GameSession);
      return "Turn reset - experience ended";
    });

  return { toggleVisibility, toggleKiosk, toggleEventKind, startTurn, resetTurn };
}
