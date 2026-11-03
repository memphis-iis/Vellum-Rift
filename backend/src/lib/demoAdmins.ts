/**
 * Bluekey demo catalog admins (Try now / curated Spaces).
 *
 * DEMO_ADMIN_EMAILS=comma-separated emails (case-insensitive).
 * When AUTH_REQUIRED is not true and the list is empty, all authenticated
 * (non-kiosk) users may curate — local-dev convenience. Production with
 * AUTH_REQUIRED=true fails closed if the list is empty.
 */

export function parseDemoAdminEmails(
  raw: string | undefined = process.env.DEMO_ADMIN_EMAILS,
): Set<string> {
  const set = new Set<string>();
  if (!raw?.trim()) return set;
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (email) set.add(email);
  }
  return set;
}

export function isDemoAdmin(
  email: string | undefined | null,
  opts: {
    authRequired?: boolean;
    adminEmails?: Set<string>;
  } = {},
): boolean {
  const authRequired =
    opts.authRequired ?? process.env.AUTH_REQUIRED === "true";
  const admins = opts.adminEmails ?? parseDemoAdminEmails();
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (admins.size > 0) return admins.has(normalized);
  // Fail open only in local/dev when no allowlist is configured.
  return !authRequired;
}
