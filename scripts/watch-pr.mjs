#!/usr/bin/env node
// Waits for a PR's CI and exits 0 only if it is green on every required job.
// Chain the merge to it so a red or missing CI run never merges:
//
//   node scripts/watch-pr.mjs <PR> && gh pr merge <PR> --squash --delete-branch
//
// Options: --require <check name> (repeatable) replaces the default required
// checks (one per OS, see scripts/lib/checks.mjs).
import { spawnSync } from "node:child_process";
import { watchPr } from "./lib/watchPr.mjs";

const args = process.argv.slice(2);
const required = [];
let pr;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--require") required.push(args[++i]);
  else if (!pr) pr = args[i];
}
if (!pr || required.includes(undefined)) {
  console.error("usage: node scripts/watch-pr.mjs <PR> [--require <check name>]...");
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
    ...(required.length > 0 ? { required } : {}),
  }),
);
