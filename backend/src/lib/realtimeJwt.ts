import { createHmac, timingSafeEqual } from "node:crypto";

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * Mint a compact HS256 JWT. Used for short-lived SFU signaling tokens.
 */
export function signHs256Jwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSec = 300,
): string {
  if (!secret) {
    throw new Error("JWT secret is required");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const body = b64urlJson({ ...payload, iat: now, exp: now + expiresInSec });
  const signingInput = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

/**
 * Verify an HS256 JWT. Returns the payload or null if invalid/expired.
 */
export function verifyHs256Jwt(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const signingInput = `${header}.${body}`;
  const expected = createHmac("sha256", secret).update(signingInput).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
