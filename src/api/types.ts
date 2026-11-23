export type RootInfo = {
  id: number;
  name: string;
  path: string;
};

export type EntryKind = "dir" | "markdown";

export type TreeEntry = {
  name: string;
  /** `/`-separated path relative to the root; `""` is the root itself. */
  relPath: string;
  kind: EntryKind;
};

/** Mirrors `CommandError.kind` on the Rust side, plus `Unknown` for unexpected failures. */
export type ErrorKind =
  | "NoRootSelected"
  | "InvalidPath"
  | "OutsideRoot"
  | "NotFound"
  | "PermissionDenied"
  | "NotADirectory"
  | "NotMarkdown"
  | "NotUtf8"
  | "Io"
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
  setRoot(path: string): Promise<RootInfo>;
  listDir(relPath: string): Promise<TreeEntry[]>;
  readMarkdown(relPath: string): Promise<string>;
}
