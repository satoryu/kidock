import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  KidockError,
  type ErrorKind,
  type FileChange,
  type InboxCounts,
  type InboxItem,
  type KidockApi,
  type OpenRequest,
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

/** Kidock's URI scheme for project files (see src-tauri/src/infra/asset_protocol.rs). */
export const ASSET_SCHEME = "kidock-asset";

/** Backend event carrying `FileChange[]` batches. */
export const CHANGES_EVENT = "kidock://changes";
/** Backend event carrying an `OpenRequest` after a notification click. */
export const OPEN_EVENT = "kidock://open";

/**
 * Subscribes to a backend event. `listen` resolves asynchronously, so an
 * unsubscribe before it resolves must still detach the listener once it exists.
 */
function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  let unlisten: (() => void) | undefined;
  let active = true;
  void listen<T>(event, (e) => handler(e.payload)).then((fn) => {
    if (active) unlisten = fn;
    else fn();
  });
  return () => {
    active = false;
    unlisten?.();
  };
}

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
  // The whole "projectId/relPath" is one encoded path segment; Rust decodes it.
  assetUrl: (projectId, relPath) => convertFileSrc(`${projectId}/${relPath}`, ASSET_SCHEME),
  openExternal: async (url) => {
    await call<null>("open_external", { url });
  },
  getNotificationsEnabled: () => call<boolean>("get_notifications_enabled"),
  setNotificationsEnabled: async (enabled) => {
    await call<null>("set_notifications_enabled", { enabled });
  },
  onOpenRequest: (handler) => subscribe<OpenRequest>(OPEN_EVENT, handler),
  onChanges: (handler) => subscribe<FileChange[]>(CHANGES_EVENT, handler),
};
