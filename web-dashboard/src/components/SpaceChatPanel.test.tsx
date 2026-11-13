import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpaceChatPanel } from "./SpaceChatPanel";
import { axeViolations } from "../test/axe";

describe("SpaceChatPanel", () => {
  it("exposes the message list as a polite log and passes axe", async () => {
    const { container } = render(
      <SpaceChatPanel
        messages={[]}
        me={null}
        status="ready"
        draft=""
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    const log = screen.getByRole("log", { name: "Chat messages" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(await axeViolations(container)).toEqual([]);
  });
});
