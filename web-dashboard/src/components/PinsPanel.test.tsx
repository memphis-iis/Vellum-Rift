import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../api/gameState", () => ({
  listArtifacts: vi.fn().mockRejectedValue(new Error("Failed to load pins")),
  deleteArtifact: vi.fn(),
  updateArtifact: vi.fn(),
}));

import { PinsPanel } from "./PinsPanel";
import { StatusProvider } from "./StatusRegion";

describe("PinsPanel", () => {
  it("surfaces load failures in an alert region", async () => {
    render(
      <StatusProvider>
        <PinsPanel sessionId="s1" localPlayerId={null} pollMs={60_000} />
      </StatusProvider>,
    );
    await waitFor(() => {
      const text = screen.getAllByRole("alert").map((a) => a.textContent ?? "");
      expect(text.join(" ")).toContain("Failed to load pins");
    });
  });
});
