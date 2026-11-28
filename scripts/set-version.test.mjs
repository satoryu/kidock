import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./set-version.mjs", import.meta.url));

const FILES = {
  "package.json": '{\n  "name": "kidock",\n  "version": "0.1.0"\n}\n',
  "src-tauri/Cargo.toml": '[package]\nname = "kidock"\nversion = "0.1.0"\n\n[dependencies]\nx = { version = "1" }\n',
  "src-tauri/tauri.conf.json": '{\n  "productName": "Kidock",\n  "version": "0.1.0"\n}\n',
};

describe("set-version.mjs", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "set-version-"));
    mkdirSync(join(root, "src-tauri"));
    for (const [rel, text] of Object.entries(FILES)) writeFileSync(join(root, rel), text);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args, "--root", root, "--no-lockfiles"], { encoding: "utf8" });
  const read = (rel) => readFileSync(join(root, rel), "utf8");

  it("rewrites the version in all three files and nothing else", () => {
    const r = run("0.2.0-rc.1");
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    for (const [rel, text] of Object.entries(FILES)) {
      expect(read(rel)).toBe(text.replace('"0.1.0"', '"0.2.0-rc.1"'));
    }
  });

  it("rejects an invalid version without touching any file", () => {
    const r = run("v0.2.0");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid version");
    for (const [rel, text] of Object.entries(FILES)) expect(read(rel)).toBe(text);
  });

  it("prints usage without a version", () => {
    expect(spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" }).status).toBe(2);
  });
});
