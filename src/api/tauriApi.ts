import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { KidockError, type ErrorKind, type KidockApi, type RootInfo, type TreeEntry } from "./types";

const KNOWN_KINDS: ReadonlySet<string> = new Set<ErrorKind>([
  "NoRootSelected",
  "InvalidPath",
  "OutsideRoot",
  "NotFound",
  "PermissionDenied",
  "NotADirectory",
  "NotMarkdown",
  "NotUtf8",
  "Io",
]);

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

async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
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
  setRoot: (path) => call<RootInfo>("set_root", { path }),
  listDir: (relPath) => call<TreeEntry[]>("list_dir", { rel: relPath }),
  readMarkdown: (relPath) => call<string>("read_markdown", { rel: relPath }),
};
