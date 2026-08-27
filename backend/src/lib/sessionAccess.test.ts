import { describe, it, expect, vi } from "vitest";
import { GameState } from "../components/gameState.js";
import {
  canAccessSession,
  isSessionCreator,
  isSessionHost,
  parseVisibility,
} from "./sessionAccess.js";

describe("sessionAccess", () => {
  it("parseVisibility accepts only public|private", () => {
    expect(parseVisibility("public")).toBe("public");
    expect(parseVisibility("private")).toBe("private");
    expect(parseVisibility("secret")).toBeNull();
    expect(parseVisibility(undefined)).toBeNull();
  });

  it("isSessionCreator matches sub or email", () => {
    const state = new GameState("x");
    state.createdBySub = "acct:1";
    state.createdByEmail = "host@memphis.edu";

    expect(isSessionCreator({ sub: "acct:1", email: "other@x.com" }, state)).toBe(true);
    expect(isSessionCreator({ sub: "acct:9", email: "HOST@memphis.edu" }, state)).toBe(true);
    expect(isSessionCreator({ sub: "acct:9", email: "guest@memphis.edu" }, state)).toBe(false);
  });

  it("public sessions are accessible to any authenticated user", async () => {
    const state = new GameState("pub");
    state.visibility = "public";
    state.createdBySub = "acct:1";
    const allowlist = { isAllowlisted: vi.fn() };
    const ok = await canAccessSession(
      { sub: "acct:2", email: "guest@memphis.edu" },
      state,
      allowlist as never,
    );
    expect(ok).toBe(true);
    expect(allowlist.isAllowlisted).not.toHaveBeenCalled();
  });

  it("private sessions require allowlist when not host", async () => {
    const state = new GameState("priv");
    state.visibility = "private";
    state.createdBySub = "acct:1";
    state.createdByEmail = "host@memphis.edu";

    const allowlist = {
      isAllowlisted: vi.fn().mockResolvedValue(false),
    };
    const denied = await canAccessSession(
      { sub: "acct:2", email: "guest@memphis.edu" },
      state,
      allowlist as never,
    );
    expect(denied).toBe(false);
    expect(allowlist.isAllowlisted).toHaveBeenCalled();

    allowlist.isAllowlisted.mockResolvedValue(true);
    const allowed = await canAccessSession(
      { sub: "acct:2", email: "guest@memphis.edu" },
      state,
      allowlist as never,
    );
    expect(allowed).toBe(true);
  });

  it("isSessionHost matches host player Bluekey stamps", () => {
    const state = new GameState("h");
    state.createdBySub = "acct:1";
    const host = state.addPlayer("Host", true);
    host.bluekeySub = "acct:9";
    host.bluekeyEmail = "delegate@memphis.edu";

    expect(isSessionHost({ sub: "acct:9", email: "x@y.com" }, state)).toBe(true);
    expect(isSessionHost({ sub: "acct:8", email: "delegate@memphis.edu" }, state)).toBe(true);
    expect(isSessionHost({ sub: "acct:8", email: "nope@memphis.edu" }, state)).toBe(false);
  });
});
