import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mintKioskToken, verifyKioskToken, kioskJwtSecret } from "./kioskJwt.js";

describe("kioskJwt", () => {
  const prev = process.env.KIOSK_JWT_SECRET;

  beforeEach(() => {
    process.env.KIOSK_JWT_SECRET = "test-kiosk-secret";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.KIOSK_JWT_SECRET;
    else process.env.KIOSK_JWT_SECRET = prev;
  });

  it("mints a verifiable session-scoped token", () => {
    const minted = mintKioskToken("session-abc");
    expect(minted.token.split(".")).toHaveLength(3);
    expect(minted.sub.startsWith("kiosk:")).toBe(true);

    const claims = verifyKioskToken(minted.token);
    expect(claims).not.toBeNull();
    expect(claims!.sessionId).toBe("session-abc");
    expect(claims!.sub).toBe(minted.sub);
  });

  it("rejects tokens signed with the wrong secret", () => {
    const minted = mintKioskToken("session-abc");
    process.env.KIOSK_JWT_SECRET = "other-secret";
    expect(verifyKioskToken(minted.token)).toBeNull();
    process.env.KIOSK_JWT_SECRET = "test-kiosk-secret";
    // secret helper still reads env
    expect(kioskJwtSecret()).toBe("test-kiosk-secret");
  });

  it("rejects non-kiosk JWTs", () => {
    expect(verifyKioskToken("not-a-jwt")).toBeNull();
  });
});
