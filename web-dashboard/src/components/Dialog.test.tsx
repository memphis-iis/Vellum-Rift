import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";
import { axeViolations } from "../test/axe";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Dialog titleId="t" onClose={() => setOpen(false)}>
          <h2 id="t">Title</h2>
          <input aria-label="name" data-autofocus />
          <button type="button">Last</button>
        </Dialog>
      ) : null}
    </div>
  );
}

describe("Dialog", () => {
  it("is a labelled modal with no axe violations", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Title" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("focuses data-autofocus control, traps Tab, closes on Escape and returns focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await userEvent.click(trigger);
    expect(screen.getByLabelText("name")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText("name")).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes when the backdrop is clicked but not the dialog body", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("heading", { name: "Title" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
