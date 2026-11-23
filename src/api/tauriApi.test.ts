import { describe, expect, it } from "vitest";
import { mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { tauriApi, toKidockError } from "./tauriApi";
import { KidockError } from "./types";

const project = { id: 1, name: "reports", path: "/r", available: true };

describe("tauriApi", () => {
  it("pickFolder opens a directory dialog and returns the path", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return "/Users/me/reports";
    });

    await expect(tauriApi.pickFolder()).resolves.toBe("/Users/me/reports");
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("plugin:dialog|open");
    expect(calls[0].payload).toMatchObject({
      options: { directory: true, multiple: false },
    });
  });

  it("pickFolder resolves to null when the user cancels", async () => {
    mockIPC(() => null);
    await expect(tauriApi.pickFolder()).resolves.toBeNull();
  });

  it("calls backend commands with the expected names and arguments", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      switch (cmd) {
        case "list_projects":
          return [project];
        case "add_project":
          return project;
        case "remove_project":
          return null;
        case "list_dir":
          return [{ name: "a.md", relPath: "a.md", kind: "markdown" }];
        case "read_markdown":
          return "# A";
      }
    });

    await expect(tauriApi.listProjects()).resolves.toEqual([project]);
    await expect(tauriApi.addProject(null, "/r")).resolves.toEqual(project);
    await expect(tauriApi.addProject("Reports", "/r")).resolves.toEqual(project);
    await expect(tauriApi.removeProject(1)).resolves.toBeUndefined();
    await expect(tauriApi.listDir(1, "docs")).resolves.toEqual([
      { name: "a.md", relPath: "a.md", kind: "markdown" },
    ]);
    await expect(tauriApi.readMarkdown(1, "docs/a.md")).resolves.toBe("# A");
    expect(calls).toEqual([
      { cmd: "list_projects", payload: {} },
      { cmd: "add_project", payload: { name: null, path: "/r" } },
      { cmd: "add_project", payload: { name: "Reports", path: "/r" } },
      { cmd: "remove_project", payload: { projectId: 1 } },
      { cmd: "list_dir", payload: { projectId: 1, rel: "docs" } },
      { cmd: "read_markdown", payload: { projectId: 1, rel: "docs/a.md" } },
    ]);
  });

  it("calls the Inbox commands with the expected names and arguments", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return { list_inbox: [], inbox_counts: { total: 0, byProject: [] }, mark_read: true, mark_all_read: 3 }[
        cmd
      ];
    });
    await expect(tauriApi.listInbox()).resolves.toEqual([]);
    await expect(tauriApi.inboxCounts()).resolves.toEqual({ total: 0, byProject: [] });
    await expect(tauriApi.markRead(2, "docs/a.md")).resolves.toBe(true);
    await expect(tauriApi.markAllRead()).resolves.toBe(3);
    expect(calls).toEqual([
      { cmd: "list_inbox", payload: {} },
      { cmd: "inbox_counts", payload: {} },
      { cmd: "mark_read", payload: { projectId: 2, rel: "docs/a.md" } },
      { cmd: "mark_all_read", payload: {} },
    ]);
  });

  it("converts backend CommandError payloads into KidockError", async () => {
    mockIPC(() => {
      throw { kind: "OverlapsProject", message: "this folder is inside, or contains, another project" };
    });

    const err = await tauriApi.addProject(null, "/r/sub").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KidockError);
    expect(err).toMatchObject({ kind: "OverlapsProject" });
  });
});

describe("tauriApi.onChanges", () => {
  const change = { projectId: 1, relPath: "a.md", kind: "created" };

  it("delivers kidock://changes payloads until unsubscribed", async () => {
    mockIPC(() => {}, { shouldMockEvents: true });
    const seen: unknown[] = [];
    const off = tauriApi.onChanges((c) => seen.push(c));
    await new Promise((r) => setTimeout(r, 0)); // let `listen` register

    await emit("kidock://changes", [change]);
    expect(seen).toEqual([[change]]);

    off();
    await emit("kidock://changes", [change]);
    expect(seen).toHaveLength(1);
  });

  it("detaches even when unsubscribed before listen resolves", async () => {
    mockIPC(() => {}, { shouldMockEvents: true });
    const seen: unknown[] = [];
    const off = tauriApi.onChanges((c) => seen.push(c));
    off();
    await new Promise((r) => setTimeout(r, 0));
    await emit("kidock://changes", [change]);
    expect(seen).toEqual([]);
  });
});

describe("tauriApi links and assets", () => {
  it("builds kidock-asset URLs with the project id and path encoded together", () => {
    mockConvertFileSrc("macos");
    expect(tauriApi.assetUrl(7, "docs/img/a b.png")).toBe(
      "kidock-asset://localhost/7%2Fdocs%2Fimg%2Fa%20b.png",
    );
    mockConvertFileSrc("windows");
    expect(tauriApi.assetUrl(7, "a.png")).toBe("http://kidock-asset.localhost/7%2Fa.png");
  });

  it("opens external links through the backend command", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return null;
    });
    await tauriApi.openExternal("https://example.com");
    expect(calls).toEqual([{ cmd: "open_external", payload: { url: "https://example.com" } }]);
  });
});

describe("tauriApi notifications", () => {
  it("gets and sets the toggle", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return cmd === "get_notifications_enabled" ? false : null;
    });
    await expect(tauriApi.getNotificationsEnabled()).resolves.toBe(false);
    await expect(tauriApi.setNotificationsEnabled(true)).resolves.toBeUndefined();
    expect(calls).toEqual([
      { cmd: "get_notifications_enabled", payload: {} },
      { cmd: "set_notifications_enabled", payload: { enabled: true } },
    ]);
  });

  it("delivers kidock://open requests", async () => {
    mockIPC(() => {}, { shouldMockEvents: true });
    const seen: unknown[] = [];
    const off = tauriApi.onOpenRequest((r) => seen.push(r));
    await new Promise((r) => setTimeout(r, 0));
    await emit("kidock://open", { projectId: 2, relPath: "a.md" });
    off();
    await emit("kidock://open", { projectId: null, relPath: null });
    expect(seen).toEqual([{ projectId: 2, relPath: "a.md" }]);
  });
});

describe("toKidockError", () => {
  it("maps unknown kinds and non-object errors to Unknown", () => {
    expect(toKidockError({ kind: "Weird", message: "m" })).toMatchObject({
      kind: "Unknown",
      message: "m",
    });
    expect(toKidockError("boom")).toMatchObject({ kind: "Unknown", message: "boom" });
    expect(toKidockError(new Error("e"))).toMatchObject({ kind: "Unknown", message: "e" });
  });
});
