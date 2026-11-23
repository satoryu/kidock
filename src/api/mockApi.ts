import { KidockError, type KidockApi, type RootInfo, type TreeEntry } from "./types";

type MockOptions = {
  /** Path returned by `pickFolder` (`null` simulates cancel). */
  pickResult?: string | null;
  /** Artificial latency in ms, to make loading states visible in the browser. */
  delayMs?: number;
};

/**
 * In-memory `KidockApi` backed by a `{ "relative/path.md": content }` map.
 * Mirrors the backend's ordering and error kinds closely enough for UI work.
 */
export function createMockApi(
  files: Record<string, string>,
  { pickResult = "/mock/reports", delayMs = 0 }: MockOptions = {},
): KidockApi {
  let root: RootInfo | null = null;

  const wait = () => new Promise((r) => setTimeout(r, delayMs));

  function checkRel(rel: string) {
    if (!root) throw new KidockError("NoRootSelected", "no folder is selected");
    if (rel.startsWith("/") || rel.split("/").includes("..")) {
      throw new KidockError("OutsideRoot", "path is outside the selected folder");
    }
  }

  return {
    async pickFolder() {
      await wait();
      return pickResult;
    },

    async setRoot(path) {
      await wait();
      const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
      root = { id: (root?.id ?? 0) + 1, name, path };
      return root;
    },

    async listDir(rel) {
      await wait();
      checkRel(rel);
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

    async readMarkdown(rel) {
      await wait();
      checkRel(rel);
      const content = files[rel];
      if (content === undefined) throw new KidockError("NotFound", "file or directory not found");
      return content;
    },
  };
}
