import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Login from "./Login";
import { axeViolations } from "../test/axe";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    openPopup: vi.fn(),
    continueInThisTab: vi.fn(),
    continueAsLocalDev: vi.fn(),
    continueAsGuest: vi.fn(),
    loading: false,
    error: null,
    authRequired: true,
    softwareIdConfigured: true,
  }),
}));

describe("Login logo links", () => {
  it("names each external link by destination and announces new tab", () => {
    render(<Login />);
    const links = screen.getAllByRole("link", { name: /opens in new tab/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("has no axe violations", async () => {
    const { container } = render(<Login />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
