// Waits for a PR's CI and decides whether it may be merged.
// I/O (the `gh` CLI, sleeping, logging) is injected so the flow is testable.
import { evaluateChecks, REQUIRED_CHECKS } from "./checks.mjs";

/**
 * @typedef {{ status: number | null, stdout: string, stderr: string }} GhResult
 * @typedef {(args: string[], opts?: { inherit?: boolean }) => GhResult} Gh
 */

/**
 * @param {object} o
 * @param {string} o.pr                PR number, URL, or branch.
 * @param {Gh} o.gh                    Runs `gh` with the given args.
 * @param {(msg: string) => void} o.log
 * @param {(ms: number) => void} o.sleep
 * @param {() => number} [o.clock]
 * @param {string[]} [o.required]      Check names that must be present.
 * @param {number} [o.appearTimeoutMs] How long to wait for checks to be reported.
 * @param {number} [o.pollMs]
 * @returns {0 | 1} exit code: 0 only when CI is green and complete.
 */
export function watchPr({
  pr,
  gh,
  log,
  sleep,
  clock = Date.now,
  required = REQUIRED_CHECKS,
  appearTimeoutMs = 180_000,
  pollMs = 10_000,
}) {
  // 1. Right after a push GitHub may not have registered the checks yet.
  const deadline = clock() + appearTimeoutMs;
  while (readChecks(gh, pr).length === 0) {
    if (clock() >= deadline) {
      log(`PR ${pr}: no checks reported within ${Math.round(appearTimeoutMs / 1000)}s`);
      return 1;
    }
    log(`PR ${pr}: waiting for checks to be reported...`);
    sleep(pollMs);
  }

  // 2. Show live progress. Its exit code is not trusted on its own.
  gh(["pr", "checks", pr, "--watch", "--fail-fast", "--interval", "15"], { inherit: true });

  // 3. Decide on the final state.
  const verdict = evaluateChecks(readChecks(gh, pr), required);
  log(`PR ${pr}: ${verdict.ok ? "OK" : "NOT OK"}: ${verdict.reason}`);
  return verdict.ok ? 0 : 1;
}

/** @param {Gh} gh @param {string} pr */
function readChecks(gh, pr) {
  // `gh pr checks` exits 8 while checks are pending but still prints JSON.
  const r = gh(["pr", "checks", pr, "--json", "name,bucket,workflow"]);
  try {
    const parsed = JSON.parse(r.stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
