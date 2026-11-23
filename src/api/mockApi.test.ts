import { describe, expect, it } from "vitest";
import { createMockApi } from "./mockApi";

const files = {
  "README.md": "# Readme",
  "docs/b.md": "# B",
  "docs/A.md": "# A",
  "docs/deep/c.md": "# C",
};

const seeded = () =>
  createMockApi({
    projects: [{ name: "reports", path: "/mock/reports", files }],
    folders: {
      "/mock/other": { "x.md": "# X" },
      "/mock/reports/sub": {},
      "/MOCK/Reports": {},
      "/mock": {},
    },
  });

describe("createMockApi", () => {
  it("lists seeded projects with ids", async () => {
    const api = seeded();
    expect(await api.listProjects()).toEqual([
      { id: 1, name: "reports", path: "/mock/reports", available: true },
    ]);
  });

  it("lists one level, directories first, case-insensitive order", async () => {
    const api = seeded();
    expect(await api.listDir(1, "")).toEqual([
      { name: "docs", relPath: "docs", kind: "dir" },
      { name: "README.md", relPath: "README.md", kind: "markdown" },
    ]);
    expect((await api.listDir(1, "docs")).map((e) => e.relPath)).toEqual([
      "docs/deep",
      "docs/A.md",
      "docs/b.md",
    ]);
  });

  it("reads files and reports errors like the backend", async () => {
    const api = seeded();
    expect(await api.readMarkdown(1, "docs/A.md")).toBe("# A");
    await expect(api.readMarkdown(1, "nope.md")).rejects.toMatchObject({ kind: "NotFound" });
    await expect(api.readMarkdown(1, "../x.md")).rejects.toMatchObject({ kind: "OutsideRoot" });
    await expect(api.readMarkdown(99, "a.md")).rejects.toMatchObject({ kind: "ProjectNotFound" });
  });

  it("adds a project with a name or the folder-name fallback, sorted by name", async () => {
    const api = seeded();
    const other = await api.addProject("  ", "/mock/other");
    expect(other).toEqual({ id: 2, name: "other", path: "/mock/other", available: true });
    expect(await api.readMarkdown(2, "x.md")).toBe("# X");
    expect((await api.listProjects()).map((p) => p.name)).toEqual(["other", "reports"]);
  });

  it("rejects duplicate and overlapping folders", async () => {
    const api = seeded();
    await expect(api.addProject(null, "/mock/reports")).rejects.toMatchObject({
      kind: "AlreadyRegistered",
    });
    await expect(api.addProject(null, "/MOCK/Reports")).rejects.toMatchObject({
      kind: "AlreadyRegistered",
    });
    await expect(api.addProject(null, "/mock/reports/sub")).rejects.toMatchObject({
      kind: "OverlapsProject",
    });
    await expect(api.addProject(null, "/mock")).rejects.toMatchObject({ kind: "OverlapsProject" });
    await expect(api.addProject(null, "/mock/nowhere")).rejects.toMatchObject({ kind: "NotFound" });
  });

  it("removes a project", async () => {
    const api = seeded();
    await api.removeProject(1);
    expect(await api.listProjects()).toEqual([]);
    await expect(api.listDir(1, "")).rejects.toMatchObject({ kind: "ProjectNotFound" });
    await expect(api.removeProject(1)).rejects.toMatchObject({ kind: "ProjectNotFound" });
  });

  it("reports unavailable projects as NotFound", async () => {
    const api = createMockApi({
      projects: [{ name: "gone", path: "/mock/gone", files: {}, available: false }],
    });
    expect((await api.listProjects())[0].available).toBe(false);
    await expect(api.listDir(1, "")).rejects.toMatchObject({ kind: "NotFound" });
  });

  it("emits changes to subscribers and applies them to its files", async () => {
    const api = seeded();
    const seen: unknown[] = [];
    const off = api.onChanges((c) => seen.push(c));
    api.emitChanges([{ projectId: 1, relPath: "new.md", kind: "created", content: "# New" }]);
    expect(seen).toEqual([[{ projectId: 1, relPath: "new.md", kind: "created" }]]);
    expect(await api.readMarkdown(1, "new.md")).toBe("# New");

    api.emitChanges([{ projectId: 1, relPath: "new.md", kind: "deleted" }]);
    await expect(api.readMarkdown(1, "new.md")).rejects.toMatchObject({ kind: "NotFound" });

    off();
    api.emitChanges([{ projectId: 1, relPath: "README.md", kind: "updated" }]);
    expect(seen).toHaveLength(2);
  });

  it("keeps an Inbox with the backend's rules", async () => {
    const api = seeded();
    api.emitChanges([{ projectId: 1, relPath: "a.md", kind: "created" }], 10);
    api.emitChanges([{ projectId: 1, relPath: "b.md", kind: "updated" }], 20);
    api.emitChanges([{ projectId: 1, relPath: "a.md", kind: "updated" }], 30);
    expect((await api.listInbox()).map((i) => [i.relPath, i.kind, i.changedAt, i.read])).toEqual([
      ["a.md", "created", 30, false],
      ["b.md", "updated", 20, false],
    ]);
    expect((await api.listInbox())[0].projectName).toBe("reports");
    expect(await api.inboxCounts()).toEqual({ total: 2, byProject: [{ projectId: 1, unread: 2 }] });

    expect(await api.markRead(1, "a.md")).toBe(true);
    expect(await api.markRead(1, "a.md")).toBe(false);
    api.emitChanges([{ projectId: 1, relPath: "b.md", kind: "deleted" }], 40);
    expect(await api.inboxCounts()).toEqual({ total: 0, byProject: [] });
    api.emitChanges([{ projectId: 1, relPath: "a.md", kind: "updated" }], 50);
    expect((await api.listInbox())[0]).toMatchObject({ kind: "updated", read: false });
    expect(await api.markAllRead()).toBe(1);

    await api.removeProject(1);
    expect(await api.listInbox()).toEqual([]);
  });

  it("returns the configured picker result", async () => {
    expect(await createMockApi({}, { pickResult: null }).pickFolder()).toBeNull();
    expect(await createMockApi({}, { pickResult: "/x" }).pickFolder()).toBe("/x");
  });
});
