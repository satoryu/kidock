import {
  KidockError,
  type FileChange,
  type InboxItem,
  type KidockApi,
  type OpenRequest,
  type ProjectInfo,
  type TreeEntry,
} from "./types";

type Files = Record<string, string>;

export type MockProject = {
  name: string;
  path: string;
  /** `{ "relative/path.md": content }` */
  files: Files;
  available?: boolean;
};

export type MockSeed = {
  projects?: MockProject[];
  /** Folders that can be added later via `addProject(name, path)`. */
  folders?: Record<string, Files>;
  /** Initial Inbox items (project names are filled in). */
  inbox?: Array<Omit<InboxItem, "projectName">>;
};

type MockOptions = {
  /** Path returned by `pickFolder` (`null` simulates cancel). */
  pickResult?: string | null;
  /** Artificial latency in ms, to make loading states visible in the browser. */
  delayMs?: number;
};

const MAX_NAME_CHARS = 100;

/** The mock adds test/dev controls on top of `KidockApi`. */
export type MockApi = KidockApi & {
  /**
   * Simulates the backend detecting changes: edits the in-memory files,
   * records them in the Inbox (same rules as the backend), then notifies.
   */
  emitChanges(changes: Array<FileChange & { content?: string }>, nowMs?: number): void;
  /** Simulates a click on an OS notification. */
  emitOpenRequest(request: OpenRequest): void;
};

/**
 * In-memory `KidockApi`. Mirrors the backend's ordering, name and overlap
 * rules, and error kinds closely enough for UI work and tests.
 */
export function createMockApi(
  seed: MockSeed,
  { pickResult = "/mock/new-project", delayMs = 0 }: MockOptions = {},
): MockApi {
  type Entry = { info: ProjectInfo; files: Files };
  const projects = new Map<number, Entry>();
  // Copies, so `emitChanges` never mutates the caller's fixtures.
  const folders = new Map(Object.entries(seed.folders ?? {}).map(([k, v]) => [k, { ...v }]));
  let nextId = 1;

  for (const seeded of seed.projects ?? []) {
    const p = { ...seeded, files: { ...seeded.files } };
    if (!folders.has(p.path)) folders.set(p.path, p.files);
    const id = nextId++;
    projects.set(id, {
      info: { id, name: p.name, path: p.path, available: p.available ?? true },
      files: p.files,
    });
  }

  const listeners = new Set<(changes: FileChange[]) => void>();
  const openListeners = new Set<(request: OpenRequest) => void>();
  let notificationsEnabled = true;
  type Item = Omit<InboxItem, "projectName">;
  const inbox = new Map<string, Item>();
  const key = (projectId: number, relPath: string) => `${projectId}\n${relPath}`;
  for (const item of seed.inbox ?? []) inbox.set(key(item.projectId, item.relPath), { ...item });
  const wait = () => new Promise((r) => setTimeout(r, delayMs));
  const segments = (path: string) => path.toLowerCase().split(/[\\/]/).filter(Boolean);
  const startsWith = (a: string[], b: string[]) => b.every((s, i) => a[i] === s);

  function project(id: number): Entry {
    const p = projects.get(id);
    if (!p) throw new KidockError("ProjectNotFound", "project not found");
    return p;
  }

  function checkRel(id: number, rel: string): Files {
    const p = project(id);
    if (rel.startsWith("/") || rel.split("/").includes("..")) {
      throw new KidockError("OutsideRoot", "path is outside the project folder");
    }
    if (!p.info.available) throw new KidockError("NotFound", "file or directory not found");
    return p.files;
  }

  return {
    async pickFolder() {
      await wait();
      return pickResult;
    },

    async listProjects() {
      await wait();
      return [...projects.values()]
        .map((p) => p.info)
        .sort(
          (a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id,
        );
    },

    async addProject(name, path) {
      await wait();
      const files = folders.get(path);
      if (!files) throw new KidockError("NotFound", "file or directory not found");
      const cand = segments(path);
      for (const { info } of projects.values()) {
        const other = segments(info.path);
        if (other.join("/") === cand.join("/")) {
          throw new KidockError("AlreadyRegistered", "this folder is already a project");
        }
        if (startsWith(cand, other) || startsWith(other, cand)) {
          throw new KidockError("OverlapsProject", "this folder is inside, or contains, another project");
        }
      }
      const fallback = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
      const trimmed = (name ?? "").trim();
      const id = nextId++;
      const info: ProjectInfo = {
        id,
        name: [...(trimmed || fallback)].slice(0, MAX_NAME_CHARS).join(""),
        path,
        available: true,
      };
      projects.set(id, { info, files });
      return info;
    },

    async removeProject(projectId) {
      await wait();
      project(projectId);
      projects.delete(projectId);
      for (const [k, item] of inbox) if (item.projectId === projectId) inbox.delete(k);
    },

    async listInbox() {
      await wait();
      return [...inbox.values()]
        .filter((i) => projects.has(i.projectId))
        .sort(
          (a, b) =>
            b.changedAt - a.changedAt ||
            a.projectId - b.projectId ||
            (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0),
        )
        .slice(0, 500)
        .map((i) => ({ ...i, projectName: projects.get(i.projectId)!.info.name }));
    },

    async inboxCounts() {
      await wait();
      const by = new Map<number, number>();
      for (const i of inbox.values()) if (!i.read) by.set(i.projectId, (by.get(i.projectId) ?? 0) + 1);
      const byProject = [...by]
        .sort(([a], [b]) => a - b)
        .map(([projectId, unread]) => ({ projectId, unread }));
      return { total: byProject.reduce((n, p) => n + p.unread, 0), byProject };
    },

    async markRead(projectId, relPath) {
      await wait();
      const item = inbox.get(key(projectId, relPath));
      if (!item || item.read) return false;
      item.read = true;
      return true;
    },

    async markAllRead() {
      await wait();
      let n = 0;
      for (const i of inbox.values()) if (!i.read) {
        i.read = true;
        n++;
      }
      return n;
    },

    async listDir(projectId, rel) {
      await wait();
      const files = checkRel(projectId, rel);
      const prefix = rel === "" ? "" : `${rel}/`;
      const children = new Map<string, TreeEntry>();
      for (const path of Object.keys(files)) {
        if (!path.startsWith(prefix)) continue;
        const [name, ...rest] = path.slice(prefix.length).split("/");
        const kind = rest.length > 0 ? "dir" : "markdown";
        children.set(name, { name, relPath: prefix + name, kind });
      }
      if (rel !== "" && children.size === 0) {
        throw new KidockError("NotFound", "file or directory not found");
      }
      return [...children.values()].sort(
        (a, b) =>
          Number(a.kind !== "dir") - Number(b.kind !== "dir") ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
      );
    },

    async getNotificationsEnabled() {
      await wait();
      return notificationsEnabled;
    },

    async setNotificationsEnabled(enabled) {
      await wait();
      notificationsEnabled = enabled;
    },

    onOpenRequest(handler) {
      openListeners.add(handler);
      return () => openListeners.delete(handler);
    },

    emitOpenRequest(request) {
      for (const l of openListeners) l(request);
    },

    onChanges(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },

    emitChanges(changes, nowMs = Date.now()) {
      for (const { content, ...c } of changes) {
        const files = projects.get(c.projectId)?.files;
        if (!files) continue;
        if (c.kind === "deleted") delete files[c.relPath];
        else files[c.relPath] = content ?? files[c.relPath] ?? "";

        // Inbox rules (see src-tauri/src/domain/inbox.rs).
        const k = key(c.projectId, c.relPath);
        const existing = inbox.get(k);
        if (c.kind === "deleted") {
          inbox.delete(k);
          continue;
        }
        const kind =
          c.kind === "updated" && existing && !existing.read && existing.kind === "created"
            ? "created"
            : c.kind;
        inbox.set(k, { projectId: c.projectId, relPath: c.relPath, kind, changedAt: nowMs, read: false });
      }
      const batch = changes.map(({ projectId, relPath, kind }) => ({ projectId, relPath, kind }));
      for (const l of listeners) l(batch);
    },

    async readMarkdown(projectId, rel) {
      await wait();
      const content = checkRel(projectId, rel)[rel];
      if (content === undefined) throw new KidockError("NotFound", "file or directory not found");
      return content;
    },
  };
}
