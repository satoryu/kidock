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
 * @param {string} [o.head]           Expected PR head commit. When set, checks are
 *                                     only trusted once the PR head is this commit,
 *                                     and the result is rejected if it moves.
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
  head,
  required = REQUIRED_CHECKS,
  appearTimeoutMs = 180_000,
  pollMs = 10_000,
}) {
  const matchesHead = (sha) => !head || sha.startsWith(head);

  // 1. Right after a push GitHub may not have moved the PR head or registered
  //    the new checks yet; until then it reports the previous commit's checks.
  const deadline = clock() + appearTimeoutMs;
  for (;;) {
    const current = head ? readHead(gh, pr) : "";
    if (matchesHead(current) && readChecks(gh, pr).length > 0) break;
    if (clock() >= deadline) {
      const why = matchesHead(current)
        ? "no checks reported"
        : `head is ${current || "unknown"}, expected ${head}`;
      log(`PR ${pr}: ${why} within ${Math.round(appearTimeoutMs / 1000)}s`);
      return 1;
    }
    log(`PR ${pr}: waiting for checks to be reported...`);
    sleep(pollMs);
  }

  // 2. Show live progress. Its exit code is not trusted on its own.
  gh(["pr", "checks", pr, "--watch", "--fail-fast", "--interval", "15"], { inherit: true });

  // 3. Decide on the final state, for the same commit.
  if (head) {
    const current = readHead(gh, pr);
    if (!matchesHead(current)) {
      log(`PR ${pr}: NOT OK: head moved to ${current || "unknown"} during the watch`);
      return 1;
    }
  }
  const verdict = evaluateChecks(readChecks(gh, pr), required);
  log(`PR ${pr}: ${verdict.ok ? "OK" : "NOT OK"}: ${verdict.reason}`);
  return verdict.ok ? 0 : 1;
}

/** @param {Gh} gh @param {string} pr */
function readHead(gh, pr) {
  return gh(["pr", "view", pr, "--json", "headRefOid", "-q", ".headRefOid"]).stdout.trim();
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
