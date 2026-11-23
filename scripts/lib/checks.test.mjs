import { describe, expect, it } from "vitest";
import { evaluateChecks, REQUIRED_CHECKS } from "./checks.mjs";

const mac = (bucket = "pass") => ({ name: "check (macos-latest)", bucket, workflow: "CI" });
const win = (bucket = "pass") => ({ name: "check (windows-latest)", bucket, workflow: "CI" });

describe("evaluateChecks", () => {
  it("defaults to one required check per OS", () => {
    expect(REQUIRED_CHECKS).toEqual(["check (macos-latest)", "check (windows-latest)"]);
  });

  it("passes when every check passed", () => {
    expect(evaluateChecks([mac(), win()])).toEqual({ ok: true, reason: "all 2 checks passed" });
  });

  it("treats skipped checks as passing", () => {
    const extra = { name: "optional", bucket: "skipping", workflow: "Other" };
    expect(evaluateChecks([mac(), win(), extra]).ok).toBe(true);
  });

  it.each(["fail", "cancel", "pending"])("fails when a check is %s", (bucket) => {
    const v = evaluateChecks([mac(), win(bucket)]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("check (windows-latest)");
    expect(v.reason).toContain(bucket);
  });

  it("fails when no checks are reported", () => {
    expect(evaluateChecks([])).toEqual({ ok: false, reason: "no checks reported" });
  });

  it("fails when a required OS job is missing", () => {
    const v = evaluateChecks([mac()]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("missing required check: check (windows-latest)");
  });

  it("accepts a custom required list", () => {
    const only = [{ name: "lint", bucket: "pass", workflow: "CI" }];
    expect(evaluateChecks(only, ["lint"]).ok).toBe(true);
    expect(evaluateChecks(only, ["lint", "e2e"]).ok).toBe(false);
  });
});
