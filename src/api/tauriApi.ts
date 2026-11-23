import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  KidockError,
  type ErrorKind,
  type FileChange,
  type InboxCounts,
  type InboxItem,
  type KidockApi,
  type ProjectInfo,
  type TreeEntry,
} from "./types";

const KNOWN_KINDS: ReadonlySet<string> = new Set<ErrorKind>([
  "ProjectNotFound",
  "AlreadyRegistered",
  "OverlapsProject",
  "InvalidPath",
  "OutsideRoot",
  "NotFound",
  "PermissionDenied",
  "NotADirectory",
  "NotMarkdown",
  "NotUtf8",
  "Io",
  "Storage",
]);

/** Backend event carrying `FileChange[]` batches. */
export const CHANGES_EVENT = "kidock://changes";

/** Normalizes whatever `invoke` rejected with into a `KidockError`. */
export function toKidockError(e: unknown): KidockError {
  if (e instanceof KidockError) return e;
  if (typeof e === "object" && e !== null && "kind" in e && "message" in e) {
    const { kind, message } = e as { kind: unknown; message: unknown };
    const k = typeof kind === "string" && KNOWN_KINDS.has(kind) ? (kind as ErrorKind) : "Unknown";
    return new KidockError(k, String(message));
  }
  if (e instanceof Error) return new KidockError("Unknown", e.message);
  return new KidockError("Unknown", String(e));
}

async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toKidockError(e);
  }
}

export const tauriApi: KidockApi = {
  async pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  },
  listProjects: () => call<ProjectInfo[]>("list_projects"),
  addProject: (name, path) => call<ProjectInfo>("add_project", { name, path }),
  removeProject: async (projectId) => {
    await call<null>("remove_project", { projectId });
  },
  listDir: (projectId, relPath) => call<TreeEntry[]>("list_dir", { projectId, rel: relPath }),
  readMarkdown: (projectId, relPath) => call<string>("read_markdown", { projectId, rel: relPath }),
  listInbox: () => call<InboxItem[]>("list_inbox"),
  inboxCounts: () => call<InboxCounts>("inbox_counts"),
  markRead: (projectId, relPath) => call<boolean>("mark_read", { projectId, rel: relPath }),
  markAllRead: () => call<number>("mark_all_read"),
  onChanges(handler) {
    // `listen` resolves asynchronously; unsubscribing before it resolves
    // must still detach the listener once it exists.
    let unlisten: (() => void) | undefined;
    let active = true;
    void listen<FileChange[]>(CHANGES_EVENT, (e) => handler(e.payload)).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  },
};
