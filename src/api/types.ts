export type ProjectInfo = {
  id: number;
  name: string;
  /** Canonical folder path (for display only; never sent back to the backend). */
  path: string;
  /** False when the folder was missing when the app started. */
  available: boolean;
};

export type EntryKind = "dir" | "markdown";

export type TreeEntry = {
  name: string;
  /** `/`-separated path relative to the project folder; `""` is the folder itself. */
  relPath: string;
  kind: EntryKind;
};

export type ChangeKind = "created" | "updated" | "deleted";

/** A detected change to a tracked `.md` file (backend event `kidock://changes`). */
export type FileChange = {
  projectId: number;
  relPath: string;
  kind: ChangeKind;
};

export type InboxItem = {
  projectId: number;
  projectName: string;
  relPath: string;
  kind: "created" | "updated";
  /** Milliseconds since the Unix epoch. */
  changedAt: number;
  read: boolean;
};

export type InboxCounts = {
  total: number;
  byProject: Array<{ projectId: number; unread: number }>;
};

/** Sent when an OS notification is clicked: open a file, or just the Inbox. */
export type OpenRequest = { projectId: number; relPath: string } | { projectId: null; relPath: null };

/** Mirrors `CommandError.kind` on the Rust side, plus `Unknown` for unexpected failures. */
export type ErrorKind =
  | "ProjectNotFound"
  | "AlreadyRegistered"
  | "OverlapsProject"
  | "InvalidPath"
  | "OutsideRoot"
  | "NotFound"
  | "PermissionDenied"
  | "NotADirectory"
  | "NotMarkdown"
  | "NotUtf8"
  | "Io"
  | "Storage"
  | "Unknown";

export class KidockError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = "KidockError";
    this.kind = kind;
  }
}

/** The only way the UI talks to the backend. Swap implementations for tests / browser dev. */
export interface KidockApi {
  /** Opens the native folder picker. Resolves to `null` if the user cancels. */
  pickFolder(): Promise<string | null>;
  /** Registered projects, sorted by name (case-insensitive), then id. */
  listProjects(): Promise<ProjectInfo[]>;
  /** Registers a folder. An empty `name` falls back to the folder name. */
  addProject(name: string | null, path: string): Promise<ProjectInfo>;
  /** Unregisters a project. Files on disk are never touched. */
  removeProject(projectId: number): Promise<void>;
  listDir(projectId: number, relPath: string): Promise<TreeEntry[]>;
  readMarkdown(projectId: number, relPath: string): Promise<string>;
  /** Newest Inbox items first (up to 500). */
  listInbox(): Promise<InboxItem[]>;
  inboxCounts(): Promise<InboxCounts>;
  /** Marks a file's Inbox item read; resolves `false` if it had none or was read. */
  markRead(projectId: number, relPath: string): Promise<boolean>;
  markAllRead(): Promise<number>;
  /** URL serving a project file (images in rendered Markdown). Synchronous. */
  assetUrl(projectId: number, relPath: string): string;
  /** Opens an http(s) link in the browser, or mailto in the mail client (others are refused). */
  openExternal(url: string): Promise<void>;
  /** Exclusion patterns (glob per path component) and the built-in defaults. */
  getExclusions(): Promise<{ patterns: string[]; defaults: string[] }>;
  /** Saves patterns (validated; blanks dropped). Resolves to the normalized list. */
  setExclusions(patterns: string[]): Promise<string[]>;
  getNotificationsEnabled(): Promise<boolean>;
  setNotificationsEnabled(enabled: boolean): Promise<void>;
  /** Subscribes to "open this" requests from notification clicks. */
  onOpenRequest(handler: (request: OpenRequest) => void): () => void;
  /** Subscribes to batches of detected changes. Returns an unsubscribe function. */
  onChanges(handler: (changes: FileChange[]) => void): () => void;
}
