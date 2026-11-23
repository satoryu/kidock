import { describe, expect, it } from "vitest";
import { watchPr } from "./watchPr.mjs";

const pass = [
  { name: "check (macos-latest)", bucket: "pass", workflow: "CI" },
  { name: "check (windows-latest)", bucket: "pass", workflow: "CI" },
];

/**
 * Fake `gh`: each JSON read returns the next response in `reads`
 * (the last one repeats). Records every call.
 */
function fakeGh(reads, heads = ["abc123"]) {
  const calls = [];
  let i = 0;
  let h = 0;
  const gh = (args, opts = {}) => {
    calls.push({ args, inherit: Boolean(opts.inherit) });
    if (args.includes("--watch")) return { status: 0, stdout: "", stderr: "" };
    if (args[1] === "view") {
      return { status: 0, stdout: `${heads[Math.min(h++, heads.length - 1)]}\n`, stderr: "" };
    }
    const r = reads[Math.min(i++, reads.length - 1)];
    return typeof r === "string"
      ? { status: 1, stdout: "", stderr: r }
      : { status: 0, stdout: JSON.stringify(r), stderr: "" };
  };
  return { gh, calls };
}

function run(reads, extra = {}, heads) {
  const { gh, calls } = fakeGh(reads, heads);
  const logs = [];
  let now = 0;
  const code = watchPr({
    pr: "7",
    gh,
    log: (m) => logs.push(m),
    sleep: (ms) => {
      now += ms;
    },
    clock: () => now,
    appearTimeoutMs: 60_000,
    pollMs: 10_000,
    ...extra,
  });
  return { code, calls, logs };
}

describe("watchPr", () => {
  it("returns 0 when all required checks pass", () => {
    const { code, calls, logs } = run([pass]);
    expect(code).toBe(0);
    const watch = calls.find((c) => c.args.includes("--watch"));
    expect(watch.args).toEqual(["pr", "checks", "7", "--watch", "--fail-fast", "--interval", "15"]);
    expect(watch.inherit).toBe(true);
    expect(logs.at(-1)).toMatch(/all 2 checks passed/);
  });

  it("waits for checks to appear before watching", () => {
    const { code, calls } = run(["no checks reported on the 'x' branch", [], pass]);
    expect(code).toBe(0);
    const firstWatch = calls.findIndex((c) => c.args.includes("--watch"));
    expect(firstWatch).toBe(3);
  });

  it("returns 1 when no checks appear before the timeout", () => {
    const { code, calls, logs } = run(["no checks reported"]);
    expect(code).toBe(1);
    expect(calls.some((c) => c.args.includes("--watch"))).toBe(false);
    expect(logs.at(-1)).toMatch(/no checks reported/);
  });

  it("returns 1 when a check fails, judging by the final JSON", () => {
    const failed = [pass[0], { ...pass[1], bucket: "fail" }];
    const { code, logs } = run([pass, failed]);
    expect(code).toBe(1);
    expect(logs.at(-1)).toMatch(/check \(windows-latest\): fail/);
  });

  it("returns 1 when an OS job is missing", () => {
    const { code } = run([[pass[0]]]);
    expect(code).toBe(1);
  });

  describe("with an expected head commit", () => {
    it("waits until the PR head matches before reading checks", () => {
      // The first view still shows the previous commit (whose checks were green).
      const { code, calls } = run([pass], { head: "new456" }, ["old123", "new456"]);
      expect(code).toBe(0);
      const views = calls.filter((c) => c.args[1] === "view");
      expect(views[0].args).toEqual(["pr", "view", "7", "--json", "headRefOid", "-q", ".headRefOid"]);
      const firstWatch = calls.findIndex((c) => c.args.includes("--watch"));
      const lastViewBeforeWatch = calls.slice(0, firstWatch).filter((c) => c.args[1] === "view");
      expect(lastViewBeforeWatch).toHaveLength(2);
    });

    it("returns 1 when the head never matches", () => {
      const { code, calls, logs } = run([pass], { head: "new456" }, ["old123"]);
      expect(code).toBe(1);
      expect(calls.some((c) => c.args.includes("--watch"))).toBe(false);
      expect(logs.at(-1)).toMatch(/head is old123, expected new456/);
    });

    it("returns 1 when the head moves during the watch", () => {
      const { code, logs } = run([pass], { head: "new456" }, ["new456", "newer789"]);
      expect(code).toBe(1);
      expect(logs.at(-1)).toMatch(/head moved to newer789/);
    });
  });

  it("uses a custom required list", () => {
    const lint = [{ name: "lint", bucket: "pass", workflow: "CI" }];
    expect(run([lint], { required: ["lint"] }).code).toBe(0);
  });
});
