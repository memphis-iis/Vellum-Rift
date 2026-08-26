import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { requireAuth, BLUEKEY_CONFIG } from "./auth.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("requireAuth (dev mode)", () => {
  beforeEach(() => {
    BLUEKEY_CONFIG.required = false;
  });

  it("attaches a stub user when AUTH_REQUIRED is not set", async () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user!.email).toBe("dev@memphis.edu");
    expect(req.user!.sub).toBe("acct:dev");
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireAuth (AUTH_REQUIRED=true)", () => {
  beforeEach(() => {
    BLUEKEY_CONFIG.required = true;
  });

  afterEach(() => {
    BLUEKEY_CONFIG.required = false;
    vi.unstubAllGlobals();
  });

  it("returns 401 without an Authorization header", async () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing or invalid Authorization header" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-Bearer Authorization header", async () => {
    const req = { headers: { authorization: "Basic abc" } } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when introspection rejects the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ active: false }),
      }),
    );

    const req = { headers: { authorization: "Bearer bad-token" } } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the user and calls next when introspection succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          active: true,
          sub: "acct:42",
          email: "user@memphis.edu",
          exp: 9999999999,
        }),
      }),
    );

    const req = { headers: { authorization: "Bearer good-token" } } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(req.user).toEqual({
      sub: "acct:42",
      email: "user@memphis.edu",
      exp: 9999999999,
    });
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
});
