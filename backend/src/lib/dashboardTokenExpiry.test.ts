import { describe, expect, it } from "vitest";

/** Mirror of web-dashboard isJwtExpired for unit coverage without browser deps. */
function isJwtExpired(token: string | null | undefined, nowSec = Date.now() / 1000): boolean {
  if (!token || token === "local-dev") return false;
  try {
    const parts = token.split(".");
    const payloadB64 = parts[1];
    if (!payloadB64) return false;
    const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp !== "number") return false;
    return payload.exp <= nowSec;
  } catch {
    return false;
  }
}

function fakeJwt(payload: object): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `hdr.${b64}.sig`;
}

describe("host JWT expiry (dashboard tokenStorage mirror)", () => {
  it("treats local-dev as never expired", () => {
    expect(isJwtExpired("local-dev")).toBe(false);
  });

  it("detects past exp", () => {
    expect(isJwtExpired(fakeJwt({ exp: 1 }), 100)).toBe(true);
    expect(isJwtExpired(fakeJwt({ exp: 200 }), 100)).toBe(false);
  });
});
