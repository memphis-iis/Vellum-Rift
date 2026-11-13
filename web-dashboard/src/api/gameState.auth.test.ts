import { describe, expect, it } from "vitest";
import { isTokenExpiredResponse } from "./gameState";

describe("isTokenExpiredResponse", () => {
  it("logs out only on token_expired", () => {
    expect(isTokenExpiredResponse(401, { error: "x", code: "token_expired" })).toBe(true);
  });

  it("does not log out for missing header, kiosk rejection, or outage", () => {
    expect(isTokenExpiredResponse(401, { error: "Missing or invalid Authorization header", code: "token_missing" })).toBe(false);
    expect(isTokenExpiredResponse(401, { error: "Kiosk token not accepted on this route", code: "kiosk_token_rejected" })).toBe(false);
    expect(isTokenExpiredResponse(503, { error: "unavailable", code: "auth_unavailable" })).toBe(false);
  });

  it("supports legacy backends without codes", () => {
    expect(isTokenExpiredResponse(401, { error: "Invalid or expired token" })).toBe(true);
    expect(isTokenExpiredResponse(401, { error: "Kiosk token not accepted on this route" })).toBe(false);
    expect(isTokenExpiredResponse(401, null)).toBe(false);
  });
});
