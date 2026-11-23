import { describe, expect, it } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
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
