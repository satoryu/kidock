import { describe, expect, it } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockApi, type MockSeed } from "../api/mockApi";
import { renderWithApi, spyApi } from "../test/utils";
import { App } from "./App";

const seed = (): MockSeed => ({
  projects: [
    { name: "reports", path: "/mock/reports", files: { "README.md": "# Reports", "notes/n.md": "# Note" } },
    { name: "agent", path: "/mock/agent", files: { "README.md": "# Agent" } },
  ],
  folders: { "/mock/new": { "x.md": "# X" }, "/mock/reports/sub": {} },
});

const projectList = () => screen.getByRole("list", { name: "Projects" });
const projectButton = (name: string) =>
  within(projectList()).getByRole("button", { name: new RegExp(`^${name}`) });

async function renderApp(options?: Parameters<typeof createMockApi>[1], s: MockSeed = seed()) {
  const spy = spyApi(createMockApi(s, options));
  renderWithApi(<App />, spy.api);
  await screen.findByRole("list", { name: "Projects" });
  return spy;
}

describe("App", () => {
  it("starts on the Inbox with the project list in the sidebar", async () => {
    await renderApp();
    expect(screen.getByRole("button", { name: /inbox/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
    expect(within(projectList()).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("agent"),
      expect.stringContaining("reports"),
    ]);
  });

  it("prompts to add a project when there are none", async () => {
    renderWithApi(<App />, createMockApi({}));
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
    expect(screen.getByText(/add a project to get started/i)).toBeInTheDocument();
  });

  it("shows a project's tree in the center bar and a file in the main area", async () => {
    await renderApp();
    await userEvent.click(projectButton("reports"));
    const tree = await screen.findByRole("tree");
    await userEvent.click(within(tree).getByRole("treeitem", { name: "README.md" }));
    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
  });

  it("resets the open file when switching projects", async () => {
    await renderApp();
    await userEvent.click(projectButton("reports"));
    await userEvent.click(await screen.findByRole("treeitem", { name: "README.md" }));
    await screen.findByRole("heading", { name: "Reports" });

    await userEvent.click(projectButton("agent"));
    expect(await screen.findByText(/select a markdown file/i)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("treeitem", { name: "README.md" }));
    expect(await screen.findByRole("heading", { name: "Agent" })).toBeInTheDocument();
  });

  describe("adding a project", () => {
    it("adds with the folder name when no name is given, then selects it", async () => {
      const { calls } = await renderApp({ pickResult: "/mock/new" });
      await userEvent.click(screen.getByRole("button", { name: "Add project" }));
      const dialog = screen.getByRole("dialog", { name: "Add project" });
      const add = within(dialog).getByRole("button", { name: "Add" });
      expect(add).toBeDisabled();

      await userEvent.click(within(dialog).getByRole("button", { name: /choose/i }));
      expect(within(dialog).getByText("/mock/new")).toBeInTheDocument();
      await userEvent.click(add);

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(calls.find((c) => c.method === "addProject")?.args).toEqual([null, "/mock/new"]);
      expect(projectButton("new")).toHaveAttribute("aria-current", "page");
      expect(await screen.findByRole("treeitem", { name: "x.md" })).toBeInTheDocument();
    });

    it("uses the given name", async () => {
      await renderApp({ pickResult: "/mock/new" });
      await userEvent.click(screen.getByRole("button", { name: "Add project" }));
      const dialog = screen.getByRole("dialog");
      await userEvent.type(within(dialog).getByRole("textbox", { name: /project name/i }), "My notes");
      await userEvent.click(within(dialog).getByRole("button", { name: /choose/i }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
      expect(await within(projectList()).findByRole("button", { name: /^My notes/ })).toBeInTheDocument();
    });

    it("keeps the dialog open with an error for an overlapping folder", async () => {
      await renderApp({ pickResult: "/mock/reports/sub" });
      await userEvent.click(screen.getByRole("button", { name: "Add project" }));
      const dialog = screen.getByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: /choose/i }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(/inside, or contains/i);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("closes without changes on Cancel or Escape", async () => {
      const { calls } = await renderApp();
      await userEvent.click(screen.getByRole("button", { name: "Add project" }));
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Add project" }));
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(calls.some((c) => c.method === "addProject")).toBe(false);
    });

    it("ignores a cancelled folder picker", async () => {
      await renderApp({ pickResult: null });
      await userEvent.click(screen.getByRole("button", { name: "Add project" }));
      const dialog = screen.getByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: /choose/i }));
      expect(within(dialog).getByText(/no folder chosen/i)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
    });
  });

  describe("deleting a project", () => {
    it("asks for confirmation, then removes it and returns to the Inbox", async () => {
      const { calls } = await renderApp();
      await userEvent.click(projectButton("reports"));
      await userEvent.click(screen.getByRole("button", { name: "Actions for reports" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

      const dialog = screen.getByRole("dialog", { name: /delete project/i });
      expect(dialog).toHaveTextContent("reports");
      expect(dialog).toHaveTextContent(/files on disk are not touched/i);
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(calls.find((c) => c.method === "removeProject")?.args).toEqual([1]);
      expect(within(projectList()).queryByRole("button", { name: /^reports/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /inbox/i })).toHaveAttribute("aria-current", "page");
    });

    it("does nothing when the confirmation is cancelled", async () => {
      const { calls } = await renderApp();
      await userEvent.click(screen.getByRole("button", { name: "Actions for agent" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
      expect(calls.some((c) => c.method === "removeProject")).toBe(false);
      expect(projectButton("agent")).toBeInTheDocument();
    });

    it("closes the menu on Escape and on an outside click", async () => {
      await renderApp();
      const button = screen.getByRole("button", { name: "Actions for agent" });
      await userEvent.click(button);
      expect(screen.getByRole("menu")).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(button).toHaveFocus();

      await userEvent.click(button);
      await userEvent.click(document.body);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("refreshes the open tree on changes, keeping folders expanded", async () => {
    const api = createMockApi(seed());
    renderWithApi(<App />, api);
    await screen.findByRole("list", { name: "Projects" });
    await userEvent.click(projectButton("reports"));
    const notes = await screen.findByRole("treeitem", { name: "notes" });
    await userEvent.click(notes);
    await screen.findByRole("treeitem", { name: "n.md" });

    act(() =>
      api.emitChanges([{ projectId: 1, relPath: "notes/fresh.md", kind: "created", content: "# F" }]),
    );
    expect(await screen.findByRole("treeitem", { name: "fresh.md" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "notes" })).toHaveAttribute("aria-expanded", "true");

    // Changes in another project do not refetch this tree.
    let listCalls = 0;
    const listDir = api.listDir;
    api.listDir = (...args) => {
      listCalls++;
      return listDir(...args);
    };
    act(() => api.emitChanges([{ projectId: 2, relPath: "x.md", kind: "created" }]));
    await new Promise((r) => setTimeout(r, 20));
    expect(listCalls).toBe(0);
    act(() => api.emitChanges([{ projectId: 1, relPath: "README.md", kind: "updated" }]));
    await waitFor(() => expect(listCalls).toBe(2)); // root + expanded "notes"
  });

  describe("Inbox", () => {
    const inboxRows = () =>
      within(screen.getByRole("list", { name: "Notifications" })).getAllByRole("button");
    const inboxButton = () => screen.getByRole("button", { name: /^Inbox/ });

    it("shows new changes on top as unread with badges", async () => {
      const api = createMockApi(seed());
      renderWithApi(<App />, api);
      await screen.findByRole("list", { name: "Projects" });

      const t = Date.now();
      act(() =>
        api.emitChanges([{ projectId: 1, relPath: "notes/new.md", kind: "created", content: "# New" }], t - 1000),
      );
      act(() => api.emitChanges([{ projectId: 2, relPath: "README.md", kind: "updated" }], t));

      await waitFor(() => expect(inboxRows()).toHaveLength(2));
      expect(inboxRows()[0]).toHaveTextContent("README.md");
      expect(inboxRows()[0]).toHaveClass("is-unread");
      expect(within(inboxButton()).getByLabelText("2 unread")).toBeInTheDocument();
      expect(within(projectButton("reports")).getByLabelText("1 unread")).toBeInTheDocument();
      expect(within(projectButton("agent")).getByLabelText("1 unread")).toBeInTheDocument();

      // Repeated saves keep a single item per file.
      act(() => api.emitChanges([{ projectId: 2, relPath: "README.md", kind: "updated" }]));
      act(() => api.emitChanges([{ projectId: 2, relPath: "README.md", kind: "updated" }]));
      await waitFor(() => expect(inboxRows()).toHaveLength(2));
    });

    it("opens an item in the main area and marks it read", async () => {
      const api = createMockApi(seed());
      renderWithApi(<App />, api);
      await screen.findByRole("list", { name: "Projects" });
      act(() =>
        api.emitChanges([{ projectId: 1, relPath: "notes/new.md", kind: "created", content: "# Fresh" }]),
      );
      await waitFor(() => expect(inboxRows()).toHaveLength(1));

      await userEvent.click(inboxRows()[0]);
      expect(await screen.findByRole("heading", { name: "Fresh" })).toBeInTheDocument();
      await waitFor(() => expect(inboxRows()[0]).not.toHaveClass("is-unread"));
      expect(within(inboxButton()).queryByLabelText(/unread/)).not.toBeInTheDocument();
      expect(inboxRows()[0]).toHaveAttribute("aria-current", "true");
    });

    it("marks an item read when its file is opened from the tree", async () => {
      const api = createMockApi(seed());
      renderWithApi(<App />, api);
      await screen.findByRole("list", { name: "Projects" });
      act(() => api.emitChanges([{ projectId: 1, relPath: "README.md", kind: "updated" }]));
      await waitFor(() => expect(within(inboxButton()).getByLabelText("1 unread")).toBeInTheDocument());

      await userEvent.click(projectButton("reports"));
      await userEvent.click(await screen.findByRole("treeitem", { name: "README.md" }));
      await waitFor(() =>
        expect(within(inboxButton()).queryByLabelText(/unread/)).not.toBeInTheDocument(),
      );
    });

    it("marks everything read", async () => {
      const api = createMockApi(seed());
      renderWithApi(<App />, api);
      await screen.findByRole("list", { name: "Projects" });
      act(() =>
        api.emitChanges([
          { projectId: 1, relPath: "README.md", kind: "updated" },
          { projectId: 2, relPath: "README.md", kind: "updated" },
        ]),
      );
      await waitFor(() => expect(within(inboxButton()).getByLabelText("2 unread")).toBeInTheDocument());
      await userEvent.click(screen.getByRole("button", { name: /mark all as read/i }));
      await waitFor(() =>
        expect(within(inboxButton()).queryByLabelText(/unread/)).not.toBeInTheDocument(),
      );
      expect(inboxRows().every((r) => !r.classList.contains("is-unread"))).toBe(true);
      expect(screen.getByRole("button", { name: /mark all as read/i })).toBeDisabled();
    });

    it("drops a removed project's items and counts", async () => {
      const api = createMockApi(seed());
      renderWithApi(<App />, api);
      await screen.findByRole("list", { name: "Projects" });
      act(() =>
        api.emitChanges([
          { projectId: 1, relPath: "README.md", kind: "updated" },
          { projectId: 2, relPath: "README.md", kind: "updated" },
        ]),
      );
      await waitFor(() => expect(inboxRows()).toHaveLength(2));
      await userEvent.click(screen.getByRole("button", { name: "Actions for reports" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(inboxRows()).toHaveLength(1));
      expect(inboxRows()[0]).toHaveTextContent("agent");
      expect(within(inboxButton()).getByLabelText("1 unread")).toBeInTheDocument();
    });
  });

  describe("OS notifications", () => {
    it("toggles notifications and persists the choice", async () => {
      const api = createMockApi(seed());
      renderWithApi(<App />, api);
      const toggle = await screen.findByRole("button", { name: /notifications on/i });
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(toggle);
      expect(screen.getByRole("button", { name: /notifications off/i })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(await api.getNotificationsEnabled()).toBe(false);
    });

    it("opens the file of a clicked notification and marks it read", async () => {
      const api = createMockApi(seed());
      renderWithApi(<App />, api);
      await screen.findByRole("list", { name: "Projects" });
      act(() => api.emitChanges([{ projectId: 2, relPath: "README.md", kind: "updated" }]));
      await userEvent.click(projectButton("reports"));

      act(() => api.emitOpenRequest({ projectId: 2, relPath: "README.md" }));
      expect(await screen.findByRole("heading", { name: "Agent" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Inbox/ })).toHaveAttribute("aria-current", "page");
      await waitFor(async () => expect((await api.inboxCounts()).total).toBe(0));
    });

    it("shows the Inbox for a summary notification", async () => {
      const api = createMockApi(seed());
      renderWithApi(<App />, api);
      await screen.findByRole("list", { name: "Projects" });
      await userEvent.click(projectButton("reports"));
      act(() => api.emitOpenRequest({ projectId: null, relPath: null }));
      expect(screen.getByRole("button", { name: /^Inbox/ })).toHaveAttribute("aria-current", "page");
    });
  });

  it("shows an unavailable project with a warning and an error in the center bar", async () => {
    await renderApp(undefined, {
      projects: [{ name: "gone", path: "/mock/gone", files: {}, available: false }],
    });
    expect(within(projectList()).getByRole("img", { name: /folder not found/i })).toBeInTheDocument();
    await userEvent.click(projectButton("gone"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/folder not found/i);
  });

  it("reports a failure to load projects", async () => {
    const api = createMockApi(seed());
    api.listProjects = () => Promise.reject(Object.assign(new Error("db"), { kind: "Storage" }));
    renderWithApi(<App />, api);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load projects/i);
  });
});
