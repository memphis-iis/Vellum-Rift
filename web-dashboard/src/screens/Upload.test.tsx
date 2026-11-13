import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api/library", () => ({
  fetchLibrary: vi.fn().mockResolvedValue({ rootFolderId: "r", uploadsFolderId: "u" }),
  listFolderOptions: vi.fn().mockResolvedValue([{ folderId: "u", label: "Uploads" }]),
}));
vi.mock("../api/upload", () => ({ uploadManuscript: vi.fn(), fetchJob: vi.fn() }));

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
    expect(await screen.findByText("Enter a document title before uploading.")).toBeVisible();
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
});
