import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api/library", () => ({
  listUploadFolderOptions: vi.fn().mockResolvedValue({
    options: [{ folderId: "u", label: "Uploads" }],
    defaultFolderId: "u",
  }),
}));
vi.mock("../api/upload", () => ({
  uploadManuscript: vi.fn(),
  uploadManuscriptComparison: vi.fn(),
  fetchJob: vi.fn(),
}));

import Upload from "./Upload";
import { StatusProvider } from "../components/StatusRegion";
import { axeViolations } from "../test/axe";

describe("Upload", () => {
  it("blocks the picker and alerts when the title is empty", async () => {
    render(
      <StatusProvider>
        <Upload />
      </StatusProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Select Files" }));
    expect(await screen.findByText("Enter an asset title before uploading.")).toBeVisible();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <StatusProvider>
        <Upload />
      </StatusProvider>,
    );
    await screen.findByRole("option", { name: "Uploads" });
    const v = await axeViolations(container);
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });

  it("side-by-side mode needs a title and has no axe violations", async () => {
    const { container } = render(
      <StatusProvider>
        <Upload />
      </StatusProvider>,
    );
    await screen.findByRole("option", { name: "Uploads" });
    await userEvent.click(screen.getByRole("radio", { name: "Side-by-side" }));
    expect(screen.getByRole("button", { name: "Upload side-by-side" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Scale to match height" })).toBeChecked();
    const v = await axeViolations(container);
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });
});
