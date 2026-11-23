import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./guard-git-add.mjs", import.meta.url));

/** Runs the hook like Claude Code does: JSON on stdin, exit code + stderr out. */
function runHook(input) {
  const stdin = typeof input === "string" ? input : JSON.stringify(input);
  return spawnSync(process.execPath, [script], { input: stdin, encoding: "utf8" });
}

const bash = (command) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command, description: "test" },
});

describe("guard-git-add hook", () => {
  it("blocks a bulk add with exit code 2 and a reason on stderr", () => {
    const r = runHook(bash("npm test && git add -A"));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/explicit paths/);
  });

  it("allows explicit paths with exit code 0 and no output", () => {
    const r = runHook(bash("git add src/a.ts docs/b.md"));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });

  it("ignores other tools", () => {
    const r = runHook({ tool_name: "Write", tool_input: { content: "git add ." } });
    expect(r.status).toBe(0);
  });

  it("does not break the tool call on unparseable input", () => {
    expect(runHook("not json").status).toBe(0);
    expect(runHook("").status).toBe(0);
  });
});
