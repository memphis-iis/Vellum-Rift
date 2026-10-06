/**
 * Session event / share helpers (#146).
 */

export type SessionKind = "exploration" | "event";

export function sessionKind(session: {
  kind?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): SessionKind {
  const raw = session?.kind ?? session?.metadata?.kind;
  return raw === "event" ? "event" : "exploration";
}

export function sessionStartsAt(session: {
  startsAt?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): string | null {
  const raw = session?.startsAt ?? session?.metadata?.startsAt;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

export function sessionEndsAt(session: {
  endsAt?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): string | null {
  const raw = session?.endsAt ?? session?.metadata?.endsAt;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** Signed-in deep link into the dashboard space room. */
export function buildInviteShareUrl(sessionId: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("session", sessionId);
  return url.toString();
}

/** Public kiosk join URL (#145) — no Bluekey. */
export function buildKioskShareUrl(sessionId: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("session", sessionId);
  url.searchParams.set("kiosk", "1");
  return url.toString();
}

/**
 * Prefer kiosk public URL when enabled; otherwise signed-in invite link.
 */
export function buildPrimaryShareUrl(
  sessionId: string,
  kioskEnabled: boolean,
): string {
  return kioskEnabled
    ? buildKioskShareUrl(sessionId)
    : buildInviteShareUrl(sessionId);
}

/** Low-effort QR image (QuickChart) for museum printouts / tablet display. */
export function qrCodeImageUrl(data: string, size = 220): string {
  const params = new URLSearchParams({
    text: data,
    size: String(size),
    margin: "1",
  });
  return `https://quickchart.io/qr?${params.toString()}`;
}

/** Newest active event among sessions the user can see. */
export function pickFeaturedEvent<T extends {
  isActive: boolean;
  updatedAt: string;
  kind?: string | null;
  metadata?: Record<string, unknown> | null;
}>(sessions: T[]): T | null {
  const events = sessions
    .filter((s) => s.isActive && sessionKind(s) === "event")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return events[0] ?? null;
}

export function formatEventWindow(
  startsAt: string | null,
  endsAt: string | null,
): string | null {
  if (!startsAt && !endsAt) return null;
  const fmt = (iso: string) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return iso;
    return new Date(t).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (startsAt && endsAt) return `${fmt(startsAt)} – ${fmt(endsAt)}`;
  if (startsAt) return `From ${fmt(startsAt)}`;
  return `Until ${fmt(endsAt!)}`;
}

export type ExperiencePhase = "playing" | "ended";

/** Museum host turn timer phase (defaults to playing). */
export function sessionExperiencePhase(session: {
  experiencePhase?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): ExperiencePhase {
  const raw = session?.experiencePhase ?? session?.metadata?.experiencePhase;
  return raw === "ended" ? "ended" : "playing";
}

/** ISO end of the current host turn, or null when untimed / reset. */
export function sessionRotationEndsAt(session: {
  rotationEndsAt?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): string | null {
  const raw = session?.rotationEndsAt ?? session?.metadata?.rotationEndsAt;
  return typeof raw === "string" && Number.isFinite(Date.parse(raw)) ? raw : null;
}

/** Whole seconds left in the turn (0 when expired); null when no timer is running. */
export function rotationSecondsRemaining(
  session: Parameters<typeof sessionRotationEndsAt>[0] &
    Parameters<typeof sessionExperiencePhase>[0],
  nowMs: number = Date.now(),
): number | null {
  if (sessionExperiencePhase(session) === "ended") return null;
  const endsAt = sessionRotationEndsAt(session);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - nowMs) / 1000));
}

/** m:ss for a countdown. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
