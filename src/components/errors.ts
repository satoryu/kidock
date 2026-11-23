import { KidockError, type ErrorKind } from "../api/types";

const MESSAGES: Record<ErrorKind, string> = {
  ProjectNotFound: "This project no longer exists.",
  AlreadyRegistered: "This folder is already a project.",
  OverlapsProject: "This folder is inside, or contains, another project.",
  InvalidPath: "The path is not valid.",
  OutsideRoot: "This path is outside the project folder.",
  NotFound: "The file or folder no longer exists.",
  PermissionDenied: "Permission denied.",
  NotADirectory: "This is not a folder.",
  NotMarkdown: "This is not a Markdown file.",
  NotUtf8: "This file is not valid UTF-8 text.",
  Io: "An unexpected error occurred.",
  Storage: "Kidock could not save or load its data.",
  Unknown: "An unexpected error occurred.",
};

export function errorKindOf(e: unknown): ErrorKind {
  if (e instanceof KidockError) return e.kind;
  const kind = (e as { kind?: unknown } | null)?.kind;
  return typeof kind === "string" && kind in MESSAGES ? (kind as ErrorKind) : "Unknown";
}

/** User-facing message for an error thrown by the API. */
export function messageFor(e: unknown): string {
  return MESSAGES[errorKindOf(e)];
}
