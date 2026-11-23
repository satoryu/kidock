import { describe, expect, it } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { tauriApi, toKidockError } from "./tauriApi";
import { KidockError } from "./types";

describe("tauriApi", () => {
  it("pickFolder opens a directory dialog and returns the path", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return "/Users/me/reports";
    });

    await expect(tauriApi.pickFolder()).resolves.toBe("/Users/me/reports");
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("plugin:dialog|open");
    expect(calls[0].payload).toMatchObject({
      options: { directory: true, multiple: false },
    });
  });

  it("pickFolder resolves to null when the user cancels", async () => {
    mockIPC(() => null);
    await expect(tauriApi.pickFolder()).resolves.toBeNull();
  });

  it("calls backend commands with the expected names and arguments", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      switch (cmd) {
        case "set_root":
          return { id: 1, name: "reports", path: "/r" };
        case "list_dir":
          return [{ name: "a.md", relPath: "a.md", kind: "markdown" }];
        case "read_markdown":
          return "# A";
      }
    });

    await expect(tauriApi.setRoot("/r")).resolves.toEqual({
      id: 1,
      name: "reports",
      path: "/r",
    });
    await expect(tauriApi.listDir("docs")).resolves.toEqual([
      { name: "a.md", relPath: "a.md", kind: "markdown" },
    ]);
    await expect(tauriApi.readMarkdown("docs/a.md")).resolves.toBe("# A");
    expect(calls).toEqual([
      { cmd: "set_root", payload: { path: "/r" } },
      { cmd: "list_dir", payload: { rel: "docs" } },
      { cmd: "read_markdown", payload: { rel: "docs/a.md" } },
    ]);
  });

  it("converts backend CommandError payloads into KidockError", async () => {
    mockIPC(() => {
      throw { kind: "OutsideRoot", message: "path is outside the selected folder" };
    });

    const err = await tauriApi.readMarkdown("../x.md").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KidockError);
    expect(err).toMatchObject({
      kind: "OutsideRoot",
      message: "path is outside the selected folder",
    });
  });
});

describe("toKidockError", () => {
  it("maps unknown kinds and non-object errors to Unknown", () => {
    expect(toKidockError({ kind: "Weird", message: "m" })).toMatchObject({
      kind: "Unknown",
      message: "m",
    });
    expect(toKidockError("boom")).toMatchObject({ kind: "Unknown", message: "boom" });
    expect(toKidockError(new Error("e"))).toMatchObject({ kind: "Unknown", message: "e" });
  });
});
