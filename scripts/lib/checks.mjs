// Decides whether a PR's CI checks allow merging.
// Input mirrors `gh pr checks --json name,bucket,workflow`; `bucket` is one of
// pass | fail | pending | skipping | cancel (see `gh pr checks --help`).

/** Job names produced by `.github/workflows/ci.yml` (one per OS). */
export const REQUIRED_CHECKS = ["check (macos-latest)", "check (windows-latest)"];

/**
 * @typedef {{ name: string, bucket: string, workflow?: string }} Check
 * @typedef {{ ok: boolean, reason: string }} Verdict
 */

/**
 * @param {Check[]} checks
 * @param {string[]} [required]
 * @returns {Verdict}
 */
export function evaluateChecks(checks, required = REQUIRED_CHECKS) {
  if (checks.length === 0) return { ok: false, reason: "no checks reported" };

  const notPassed = checks.filter((c) => c.bucket !== "pass" && c.bucket !== "skipping");
  if (notPassed.length > 0) {
    const list = notPassed.map((c) => `${c.name}: ${c.bucket}`).join(", ");
    return { ok: false, reason: `checks not passed: ${list}` };
  }

  const names = new Set(checks.map((c) => c.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    return { ok: false, reason: `missing required check: ${missing.join(", ")}` };
  }

  return { ok: true, reason: `all ${checks.length} checks passed` };
}
