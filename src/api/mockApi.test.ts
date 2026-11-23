import { describe, expect, it } from "vitest";
import { createMockApi } from "./mockApi";

const files = {
  "README.md": "# Readme",
  "docs/b.md": "# B",
  "docs/A.md": "# A",
  "docs/deep/c.md": "# C",
};

describe("createMockApi", () => {
  it("requires setRoot before listing", async () => {
    const api = createMockApi(files);
    await expect(api.listDir("")).rejects.toMatchObject({ kind: "NoRootSelected" });
  });

  it("lists one level, directories first, case-insensitive order", async () => {
    const api = createMockApi(files);
    const root = await api.setRoot(await api.pickFolder().then((p) => p!));
    expect(root.name).toBe("reports");
    expect(await api.listDir("")).toEqual([
      { name: "docs", relPath: "docs", kind: "dir" },
      { name: "README.md", relPath: "README.md", kind: "markdown" },
    ]);
    expect((await api.listDir("docs")).map((e) => e.relPath)).toEqual([
      "docs/deep",
      "docs/A.md",
      "docs/b.md",
    ]);
  });

  it("reads files and reports errors like the backend", async () => {
    const api = createMockApi(files);
    await api.setRoot("/mock/reports");
    expect(await api.readMarkdown("docs/A.md")).toBe("# A");
    await expect(api.readMarkdown("nope.md")).rejects.toMatchObject({ kind: "NotFound" });
    await expect(api.readMarkdown("../x.md")).rejects.toMatchObject({ kind: "OutsideRoot" });
  });

  it("can simulate a cancelled picker", async () => {
    const api = createMockApi(files, { pickResult: null });
    expect(await api.pickFolder()).toBeNull();
  });
});
