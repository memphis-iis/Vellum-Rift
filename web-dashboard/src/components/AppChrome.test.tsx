import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppChrome } from "./AppChrome";
import { axeViolations } from "../test/axe";

function setup() {
  const onNavigate = vi.fn();
  const onSignOut = vi.fn();
  const view = render(
    <AppChrome active="home" email="a@b.edu" onNavigate={onNavigate} onSignOut={onSignOut} />,
  );
  return { onNavigate, onSignOut, ...view };
}

describe("AppChrome", () => {
  it("has no axe violations", async () => {
    const { container } = setup();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("navigates home via keyboard-activatable brand button", async () => {
    const { onNavigate } = setup();
    const btn = screen.getByRole("button", { name: /vellum rift home/i });
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(onNavigate).toHaveBeenCalledWith("home");
  });
});
