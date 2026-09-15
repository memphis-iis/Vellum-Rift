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
