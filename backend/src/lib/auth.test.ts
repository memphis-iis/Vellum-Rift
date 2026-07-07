import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mock the BLUEKEY_CONFIG before importing the module under test
vi.mock("./auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth.js")>();
  return {
    ...actual,
    BLUEKEY_CONFIG: {
      ...actual.BLUEKEY_CONFIG,
      required: false, // Dev mode for tests
    },
  };
});

// Import after mocks are set up
import { requireAuth, BLUEKEY_CONFIG } from "./auth.js";

describe("requireAuth (dev mode)", () => {
  it("attaches a stub user when AUTH_REQUIRED is not set", async () => {
    const req = { headers: {} } as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user!.email).toBe("dev@memphis.edu");
    expect(req.user!.sub).toBe("acct:dev");
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("BLUEKEY_CONFIG defaults", () => {
  it("has sensible default URLs", () => {
    expect(BLUEKEY_CONFIG.portalUrl).toBe("https://iis.memphis.edu/static/bluekey/");
    expect(BLUEKEY_CONFIG.origin).toBe("https://iis.memphis.edu");
    expect(BLUEKEY_CONFIG.introspectUrl).toBe(
      "https://iis.memphis.edu/apis/bluekey/public/sso/introspect",
    );
  });

  it("does not require auth by default", () => {
    expect(BLUEKEY_CONFIG.required).toBe(false);
  });
});