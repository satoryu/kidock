#!/usr/bin/env node
// Claude Code PreToolUse hook: blocks bulk `git add` forms in Bash commands.
// Contract (https://code.claude.com/docs/en/hooks): the tool call arrives as
// JSON on stdin; exit code 2 blocks it and stderr is shown to Claude; exit 0
// leaves the decision to the normal permission flow.
import { findBulkGitAdd } from "../../scripts/lib/gitAddGuard.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let command;
try {
  const input = JSON.parse(raw);
  if (input?.tool_name === "Bash") command = input.tool_input?.command;
} catch {
  // Not our input: never break unrelated tool calls.
}

const reason = typeof command === "string" ? findBulkGitAdd(command) : null;
if (reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}
