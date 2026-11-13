import { useEffect, useState } from "react";
import {
  formatCountdown,
  rotationSecondsRemaining,
  sessionExperiencePhase,
} from "../api/sessionEvent";

type Props = {
  session: Parameters<typeof rotationSecondsRemaining>[0] | null;
  /** Only the host needs the ticking clock. */
  ticking: boolean;
};

/** Owns the 1 s clock so the surrounding screen does not re-render each second. */
export function TurnCountdown({ session, ticking }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const phase = sessionExperiencePhase(session);
  const secondsLeft = rotationSecondsRemaining(session ?? {}, now);
  const running = phase === "playing" && secondsLeft !== null;
  const ended = phase === "ended" || (running && secondsLeft === 0);
  const endsAt = (session as { rotationEndsAt?: string } | null)?.rotationEndsAt;

  useEffect(() => {
    if (!ticking || !running) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking, running, endsAt]);

  return (
    <span
      className={`vr-enter__turn-countdown${ended ? " vr-enter__turn-countdown--ended" : ""}`}
      role="timer"
      aria-live="off"
    >
      {ended ? "Ended" : running ? formatCountdown(secondsLeft) : "No timer"}
    </span>
  );
}
