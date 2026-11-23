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
  /** Subscribes to batches of detected changes. Returns an unsubscribe function. */
  onChanges(handler: (changes: FileChange[]) => void): () => void;
}
