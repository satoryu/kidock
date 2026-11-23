import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockApi } from "../api/mockApi";
import { renderWithApi } from "../test/utils";
import { App } from "./App";

const files = { "README.md": "# Readme", "notes/n.md": "# Note" };

describe("App", () => {
  it("opens a folder, shows its tree, and renders a selected file", async () => {
    renderWithApi(<App />, createMockApi(files));
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /open folder/i }));
    const tree = await screen.findByRole("tree");
    expect(screen.getByText("reports")).toBeInTheDocument();

    await userEvent.click(within(tree).getByRole("treeitem", { name: "README.md" }));
    expect(await screen.findByRole("heading", { name: "Readme" })).toBeInTheDocument();
  });

  it("does nothing when the picker is cancelled", async () => {
    renderWithApi(<App />, createMockApi(files, { pickResult: null }));
    await userEvent.click(screen.getByRole("button", { name: /open folder/i }));
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();
  });

  it("resets the selection when another folder is opened", async () => {
    renderWithApi(<App />, createMockApi(files));
    await userEvent.click(screen.getByRole("button", { name: /open folder/i }));
    await userEvent.click(await screen.findByRole("treeitem", { name: "README.md" }));
    await screen.findByRole("heading", { name: "Readme" });

    await userEvent.click(screen.getByRole("button", { name: /open folder/i }));
    expect(await screen.findByText(/select a markdown file/i)).toBeInTheDocument();
  });

  it("shows an error if the folder cannot be opened", async () => {
    const api = createMockApi(files);
    api.setRoot = () => Promise.reject(Object.assign(new Error("gone"), { kind: "NotFound" }));
    renderWithApi(<App />, api);
    await userEvent.click(screen.getByRole("button", { name: /open folder/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not open/i);
  });
});
