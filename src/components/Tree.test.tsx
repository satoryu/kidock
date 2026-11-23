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

const mockWith = (f: Record<string, string>) =>
  createMockApi({ projects: [{ name: "reports", path: "/mock/reports", files: f }] });

function setup(f: Record<string, string> = files) {
  const spy = spyApi(mockWith(f));
  const onSelect = vi.fn();
  renderWithApi(<Tree projectId={1} selected={null} onSelect={onSelect} />, spy.api);
  return { ...spy, onSelect };
}

describe("Tree", () => {
  it("lists the root level", async () => {
    setup();
    expect(await screen.findByRole("treeitem", { name: "docs" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "README.md" })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "a.md" })).not.toBeInTheDocument();
  });

  it("loads children lazily, once per expansion", async () => {
    const { calls } = setup();
    const docs = await screen.findByRole("treeitem", { name: "docs" });
    const listCalls = () => calls.filter((c) => c.method === "listDir").map((c) => c.args[1]);
    expect(calls.filter((c) => c.method === "listDir").every((c) => c.args[0] === 1)).toBe(true);
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
    const { onSelect } = setup();
    await userEvent.click(await screen.findByRole("treeitem", { name: "README.md" }));
    expect(onSelect).toHaveBeenCalledWith("README.md");
  });

  it("marks the selected file", async () => {
    renderWithApi(<Tree projectId={1} selected="README.md" onSelect={() => {}} />, mockWith(files));
    expect(await screen.findByRole("treeitem", { name: "README.md" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows an empty state when the folder has no markdown", async () => {
    setup({});
    expect(await screen.findByText(/no markdown files/i)).toBeInTheDocument();
  });

  it("shows an error when a directory cannot be listed", async () => {
    const api = {
      ...mockWith(files),
      listDir: () => Promise.reject(Object.assign(new Error("denied"), { kind: "PermissionDenied" })),
    };
    renderWithApi(<Tree projectId={1} selected={null} onSelect={() => {}} />, api);
    expect(await screen.findByRole("alert")).toHaveTextContent(/permission/i);
  });
});
