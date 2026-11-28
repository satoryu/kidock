import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./release-check.mjs", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const run = (args, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

describe("release-check.mjs (against this repository)", () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("passes for the current version and writes the step outputs", () => {
    dir = mkdtempSync(join(tmpdir(), "release-check-"));
    const out = join(dir, "out");
    const r = run([`v${version}`, "--github-output"], { GITHUB_OUTPUT: out });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(`version=${version}\nprerelease=false\n`);
  });

  it("fails and names the files when the tag does not match", () => {
    const r = run(["v99.0.0"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`package.json has version ${version}, expected 99.0.0`);
    expect(r.stderr).toContain("src-tauri/Cargo.toml");
    expect(r.stderr).toContain("src-tauri/tauri.conf.json");
  });

  it("rejects a malformed tag", () => {
    const r = run(["release-1"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid tag");
  });

  it("prints usage without a tag", () => {
    expect(run([]).status).toBe(2);
  });
});
