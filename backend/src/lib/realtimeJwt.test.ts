import { describe, it, expect } from "vitest";
import { signHs256Jwt, verifyHs256Jwt } from "./realtimeJwt.js";

describe("realtimeJwt", () => {
  it("round-trips a signed payload", () => {
    const token = signHs256Jwt({ sessionId: "s1", playerId: "p1" }, "secret", 60);
    const payload = verifyHs256Jwt(token, "secret");
    expect(payload).not.toBeNull();
    expect(payload!.sessionId).toBe("s1");
    expect(payload!.playerId).toBe("p1");
  });

  it("rejects tampered tokens", () => {
    const token = signHs256Jwt({ sessionId: "s1" }, "secret", 60);
    const bad = token.slice(0, -2) + "ab";
    expect(verifyHs256Jwt(bad, "secret")).toBeNull();
  });

  it("rejects wrong secrets", () => {
    const token = signHs256Jwt({ sessionId: "s1" }, "secret", 60);
    expect(verifyHs256Jwt(token, "other")).toBeNull();
  });
});
