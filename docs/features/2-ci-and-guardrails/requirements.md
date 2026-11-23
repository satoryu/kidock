# Issue #2 — Requirements: CI on Windows & macOS + repository guardrails

## Problem Statement

Kidock targets Windows and macOS, but so far everything has been verified on macOS only, by hand. `CLAUDE.md` requires CI to pass on both OSes and says the merge must wait for that result. It also says `git add -A` must never be used. Neither rule is enforced yet: there is no CI, no command that ties merging to it, and no guard against bulk staging.

## Requirements

### Functional

- **F1 — CI workflow**: a GitHub Actions workflow runs on `windows-latest` and `macos-latest` for every pull request into `main` and every push to `main`. Each OS runs:
  - `cargo fmt --check`, `cargo clippy --all-targets -D warnings`, `cargo test`
  - `npm ci`, `npm run typecheck`, `npm test`
  - a Tauri build check (`npm run tauri build -- --debug --no-bundle`: compiles the frontend and the app binary, without installers)
- **F2 — Watch-and-merge**: a script waits for a PR's CI checks and exits `0` only when every check passed and both OS jobs ran. Otherwise it exits non-zero, so that `<script> <PR> && gh pr merge <PR> --squash --delete-branch` never merges on red or missing CI.
- **F3 — Watch `main`**: a documented command that waits for the CI run of the merge commit on `main` and exits non-zero if it fails.
- **F4 — `git add` guard**: a Claude Code `PreToolUse` hook (`.claude/settings.json` + script) blocks Bash commands that stage files in bulk, and lets explicit paths through:
  - `git add -A`, `git add --all`, `git add .`
  - also `git add -u` / `--update`, and the pathspecs `./`, `:/`, `*` (same effect: staging without naming files)
  - also inside chains (`&&`, `||`, `;`, `|`, newlines) and with git global options (`git -C dir add .`)
- **F5 — Docs**: replace the two TODOs in `CLAUDE.md` (Definition of Done command, hook reference) and add a CI badge to the README.

### Non-Functional

- **N1 — Cross-platform scripts**: the hook and the watch script run on both macOS and Windows. Both are Node scripts, because Node is already required by the project. Shell scripts would need Git Bash on Windows.
- **N2 — Testable**: the decision logic (command parsing, check evaluation) lives in pure functions with Vitest tests, separate from process I/O.
- **N3 — Reasonable CI time**: cache Cargo and npm. Don't build installers.
- **N4 — Least privilege**: the workflow token is read-only (`permissions: contents: read`).

## Constraints

- Linux CI is out of scope (Linux is best effort, and it needs WebKitGTK system packages).
- The hook is a guardrail for the agent, not a security boundary. The hooks docs call parsing best-effort. A fail-closed mode is used where available.
- Action versions are pinned to the current major versions (checked 2026-11-23: `actions/checkout@v7`, `actions/setup-node@v7`, `Swatinem/rust-cache@v2`, `dtolnay/rust-toolchain@stable`).
- Branch protection settings on GitHub are changed only with the owner's approval. They are not part of this Issue.

## Acceptance Criteria

- **AC1**: CI runs and is green on both OSes for this Issue's PR.
- **AC2**: The watch-and-merge script exits non-zero when CI fails. Proven by a unit test and by one real run against a deliberately failing commit on this branch, which is then reverted.
- **AC3**: The script also exits non-zero when no checks are reported, or when an OS job is missing.
- **AC4**: The hook blocks every form in F4 and allows explicit paths (`git add src/a.ts docs/x.md`, `git add -p src/a.ts`). Proven by unit tests, plus a real attempt in a Claude Code session after the hook is active.
- **AC5**: The `CLAUDE.md` TODOs are replaced with working commands.

## User Stories

- As the owner, I want every PR checked on Windows and macOS so that platform regressions surface before merge.
- As the owner, I want merging to happen only after green CI so that "merge, then notice CI failed" cannot happen.
- As the owner, I want the agent physically prevented from bulk-staging so that stray files (secrets, build output) never get committed by accident.
