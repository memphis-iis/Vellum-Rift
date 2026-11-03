import { describe, expect, it } from "vitest";
import { isDemoAdmin, parseDemoAdminEmails } from "./demoAdmins.js";

describe("demoAdmins", () => {
  it("parses comma-separated emails", () => {
    expect([...parseDemoAdminEmails("A@x.com, b@y.com")]).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("allowlist match is case-insensitive", () => {
    const admins = parseDemoAdminEmails("Admin@memphis.edu");
    expect(
      isDemoAdmin("admin@memphis.edu", { authRequired: true, adminEmails: admins }),
    ).toBe(true);
    expect(
      isDemoAdmin("other@memphis.edu", { authRequired: true, adminEmails: admins }),
    ).toBe(false);
  });

  it("fails closed when auth required and allowlist empty", () => {
    expect(
      isDemoAdmin("anyone@memphis.edu", {
        authRequired: true,
        adminEmails: new Set(),
      }),
    ).toBe(false);
  });

  it("fails open in local/dev when allowlist empty", () => {
    expect(
      isDemoAdmin("dev@memphis.edu", {
        authRequired: false,
        adminEmails: new Set(),
      }),
    ).toBe(true);
  });
});
