import { describe, it, expect } from "vitest";
import {
  corsAllowedOrigins,
  corsOriginOption,
} from "./securityHeaders.js";

describe("securityHeaders / CORS (#265)", () => {
  it("defaults to memphis + local vite origins", () => {
    const origins = corsAllowedOrigins("");
    expect(origins).toContain("https://iis.memphis.edu");
    expect(origins).toContain("http://localhost:5173");
  });

  it("parses CORS_ALLOWED_ORIGINS", () => {
    expect(corsAllowedOrigins("https://a.example, https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("reflects allowlisted Origin and rejects others", () => {
    const allow = ["https://iis.memphis.edu"];
    corsOriginOption("https://iis.memphis.edu", (err, value) => {
      expect(err).toBeNull();
      expect(value).toBe("https://iis.memphis.edu");
    }, allow);
    corsOriginOption("https://evil.example", (err, value) => {
      expect(err).toBeNull();
      expect(value).toBe(false);
    }, allow);
  });
});
