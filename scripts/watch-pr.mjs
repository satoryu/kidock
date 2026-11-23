#!/usr/bin/env node
// Waits for a PR's CI and exits 0 only if it is green on every required job.
// Chain the merge to it, pinned to the same commit, so a red, missing, or
// stale CI result never merges:
//
//   HEAD_SHA=$(git rev-parse HEAD)
//   node scripts/watch-pr.mjs <PR> --head "$HEAD_SHA" &&
//     gh pr merge <PR> --squash --delete-branch --match-head-commit "$HEAD_SHA"
//
// Options:
//   --head <sha>          only trust checks once the PR head is this commit
//   --require <name>      (repeatable) replaces the default required checks
//                         (one per OS, see scripts/lib/checks.mjs)
import { spawnSync } from "node:child_process";
import { watchPr } from "./lib/watchPr.mjs";

const args = process.argv.slice(2);
const required = [];
let pr;
let head;
let bad = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--require") required.push(args[++i]);
  else if (args[i] === "--head") {
    head = args[++i];
    if (!head) bad = true;
  }
  else if (!pr) pr = args[i];
  else bad = true;
}
if (!pr || bad || required.includes(undefined)) {
  console.error("usage: node scripts/watch-pr.mjs <PR> [--head <sha>] [--require <check name>]...");
  process.exit(2);
}

/** @type {import("./lib/watchPr.mjs").Gh} */
const gh = (ghArgs, { inherit = false } = {}) => {
  const r = spawnSync("gh", ghArgs, {
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
  });
  if (r.error) {
    console.error(`failed to run gh: ${r.error.message}`);
    process.exit(1);
  }
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

process.exit(
  watchPr({
    pr,
    gh,
    log: (m) => console.error(m),
    sleep,
    head,
    ...(required.length > 0 ? { required } : {}),
  }),
);
