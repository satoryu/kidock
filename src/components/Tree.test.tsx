import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockApi } from "../api/mockApi";
import { renderWithApi, spyApi } from "../test/utils";
import { Tree } from "./Tree";

const files = {
  "README.md": "# r",
  "docs/a.md": "# a",
  "docs/deep/b.md": "# b",
};

async function setup(f: Record<string, string> = files) {
  const mock = createMockApi(f);
  await mock.setRoot("/mock/reports");
  const spy = spyApi(mock);
  const onSelect = vi.fn();
  renderWithApi(<Tree selected={null} onSelect={onSelect} />, spy.api);
  return { ...spy, onSelect };
}

describe("Tree", () => {
  it("lists the root level", async () => {
    await setup();
    expect(await screen.findByRole("treeitem", { name: "docs" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "README.md" })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "a.md" })).not.toBeInTheDocument();
  });

  it("loads children lazily, once per expansion", async () => {
    const { calls } = await setup();
    const docs = await screen.findByRole("treeitem", { name: "docs" });
    const listCalls = () => calls.filter((c) => c.method === "listDir").map((c) => c.args[0]);
    expect(listCalls()).toEqual([""]);

    await userEvent.click(docs);
    expect(await screen.findByRole("treeitem", { name: "a.md" })).toBeInTheDocument();
    expect(docs).toHaveAttribute("aria-expanded", "true");
    expect(listCalls()).toEqual(["", "docs"]);

    await userEvent.click(docs);
    expect(screen.queryByRole("treeitem", { name: "a.md" })).not.toBeInTheDocument();
    expect(docs).toHaveAttribute("aria-expanded", "false");
  });

  it("selects markdown files", async () => {
    const { onSelect } = await setup();
    await userEvent.click(await screen.findByRole("treeitem", { name: "README.md" }));
    expect(onSelect).toHaveBeenCalledWith("README.md");
  });

  it("marks the selected file", async () => {
    const mock = createMockApi(files);
    await mock.setRoot("/mock/reports");
    renderWithApi(<Tree selected="README.md" onSelect={() => {}} />, mock);
    expect(await screen.findByRole("treeitem", { name: "README.md" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows an empty state when the folder has no markdown", async () => {
    await setup({});
    expect(await screen.findByText(/no markdown files/i)).toBeInTheDocument();
  });

  it("shows an error when a directory cannot be listed", async () => {
    const mock = createMockApi(files);
    await mock.setRoot("/mock/reports");
    const api = { ...mock, listDir: () => Promise.reject(Object.assign(new Error("denied"), { kind: "PermissionDenied" })) };
    renderWithApi(<Tree selected={null} onSelect={() => {}} />, api);
    expect(await screen.findByRole("alert")).toHaveTextContent(/permission/i);
  });
});
