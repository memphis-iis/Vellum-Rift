import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusProvider, useStatus } from "./StatusRegion";
import { axeViolations } from "../test/axe";

function Probe() {
  const status = useStatus();
  return (
    <>
      <button type="button" onClick={() => status.announce("Upload done")}>
        info
      </button>
      <button type="button" onClick={() => status.alert("Connection lost")}>
        err
      </button>
    </>
  );
}

describe("StatusProvider", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("routes info to role=status and errors to role=alert", async () => {
    render(
      <StatusProvider>
        <Probe />
      </StatusProvider>,
    );
    await userEvent.click(screen.getByText("info"));
    await userEvent.click(screen.getByText("err"));
    expect(screen.getByRole("status")).toHaveTextContent("Upload done");
    expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
  });

  it("de-duplicates repeats and auto-dismisses", async () => {
    render(
      <StatusProvider>
        <Probe />
      </StatusProvider>,
    );
    await userEvent.click(screen.getByText("err"));
    await userEvent.click(screen.getByText("err"));
    expect(screen.getAllByText("Connection lost")).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(13_000);
    });
    expect(screen.queryByText("Connection lost")).toBeNull();
  });

  it("is dismissible by keyboard and has no axe violations", async () => {
    const { container } = render(
      <StatusProvider>
        <Probe />
      </StatusProvider>,
    );
    await userEvent.click(screen.getByText("err"));
    expect(await axeViolations(container)).toEqual([]);
    await userEvent.tab();
    await userEvent.tab();
    const dismiss = screen.getByRole("button", { name: "Dismiss notification" });
    dismiss.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByText("Connection lost")).toBeNull();
  });
});
