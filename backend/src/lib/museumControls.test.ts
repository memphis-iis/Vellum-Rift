import { describe, it, expect } from "vitest";
import {
  computeGallerySpawnSlot,
  isMuseumPath,
  parseControlScheme,
  DEFAULT_SPAWN_RADIUS,
} from "./museumControls.js";

describe("museumControls (#322)", () => {
  it("isMuseumPath requires event + kiosk", () => {
    expect(isMuseumPath({})).toBe(false);
    expect(isMuseumPath({ kind: "event" })).toBe(false);
    expect(isMuseumPath({ kioskEnabled: true })).toBe(false);
    expect(isMuseumPath({ kind: "event", kioskEnabled: true })).toBe(true);
    expect(isMuseumPath({ kind: "exploration", kioskEnabled: true })).toBe(false);
  });

  it("parseControlScheme accepts known ids", () => {
    expect(parseControlScheme("default")).toBe("default");
    expect(parseControlScheme("splitLaserJetpack")).toBe("splitLaserJetpack");
    expect(parseControlScheme("gamepad")).toBeNull();
  });

  it("computeGallerySpawnSlot faces manuscript origin", () => {
    const pose = computeGallerySpawnSlot(0, { radius: DEFAULT_SPAWN_RADIUS });
    expect(pose.x).toBeCloseTo(0, 5);
    expect(pose.z).toBeCloseTo(DEFAULT_SPAWN_RADIUS, 5);
    // Forward from yaw should point toward origin (negative Z from +Z spawn).
    const yawRad = (pose.yaw * Math.PI) / 180;
    const fx = Math.sin(yawRad);
    const fz = Math.cos(yawRad);
    const toOriginX = -pose.x;
    const toOriginZ = -pose.z;
    const len = Math.hypot(toOriginX, toOriginZ);
    const dot = (fx * toOriginX + fz * toOriginZ) / len;
    expect(dot).toBeGreaterThan(0.99);
  });
});
