# Issue #2 — Tasks

Complete in order. Follow TDD (write a failing test first) for every task that contains logic.

## 1. Test setup

- [x] 1.1 Split Vitest into two projects: `web` (jsdom + `src/test/setup.ts`, `src/**`) and `scripts` (node, `scripts/**/*.test.mjs`, `.claude/**/*.test.mjs`). A per-file environment comment was not enough: the jsdom setup file still ran.

## 2. Git add guard

- [x] 2.1 `findBulkGitAdd` tests first: blocked forms (`-A`, `--all`, `.`, `./`, `:/`, `*`, `-u`, `--update`, `-Av`, `-- .`), chains (`&&`, `;`, `|`, newline), `$( )`, `git -C dir add .`, `VAR=1 git add .`. Allowed: explicit paths, `-p file`, `-N file`, `git status`, `echo "git add ."`, `git commit -m "git add ."`.
- [x] 2.2 Implement `scripts/lib/gitAddGuard.mjs` (tokenizer + matcher).
- [x] 2.3 `.claude/hooks/guard-git-add.mjs` entry point (stdin JSON → exit 2 + stderr, or exit 0). Test it by spawning it with sample stdin.
- [x] 2.4 `.claude/settings.json`: re-check the hook keys (`args`, `timeout`, `onFailure`) against the current hooks docs and the installed Claude Code version. Then add the hook. → Exec form (`command` + `args`) and `onFailure: "block"` per the hooks docs; installed Claude Code is 2.1.330 (≥ 2.1.295 needed for `onFailure`).
- [x] 2.5 Real check: in this session, `git add .` is blocked and `git add <path>` works (AC4). → After the settings reloaded: `git add .` was blocked with the reason on stderr, `git add README.md` ran. The hook also caught a false positive (a quoted heredoc PR body mentioning a bulk add); fixed with tests in 361beb7.

## 3. Watch-and-merge

- [x] 3.1 `evaluateChecks` tests first: all pass; pass + skipping; one fail; cancel; pending; empty; a required OS job missing.
- [x] 3.2 Implement `scripts/lib/checks.mjs`.
- [x] 3.3 `scripts/watch-pr.mjs`: wait for checks to appear, `gh pr checks --watch --fail-fast`, re-read the JSON, evaluate, exit code. Supports `--require`. Inject the `gh` runner so the flow is unit-testable (no checks → timeout → exit 1).

## 4. CI

- [x] 4.1 Add `.nvmrc` (`22`) and `.gitattributes` (`* text=auto eol=lf`). Renormalize if needed. → No CRLF files in the index (`git ls-files --eol`), so no renormalization was needed.
- [x] 4.2 `.github/workflows/ci.yml` as designed. Re-check the inputs of each action's current major version (`actions/checkout@v7`, `actions/setup-node@v7`, `dtolnay/rust-toolchain`, `Swatinem/rust-cache@v2`) in their READMEs. → Inputs checked in the READMEs (`node-version-file`, `cache`, `components`, `workspaces: src-tauri -> target`, `persist-credentials`). Debug Rust builds do not need `dist/` (checked locally), so the cargo steps run before any frontend build.
- [x] 4.3 Open the PR and get CI green on both OSes (AC1). Fix Windows-only failures as they appear. → Green on the first run (45195600528: macOS 4m24s, Windows 6m11s); no Windows-only fixes needed.
- [x] 4.4 AC2 real run: push a deliberately failing test, confirm `watch-pr.mjs` exits non-zero, then revert and confirm it exits 0. → Exit 1 on the failing commit 5cca9e7 (run 45196874962, fail-fast after macOS failed). Exit 0 is shown by the final merge gate after the revert. Also observed: a push mid-watch reset the checks and the script exited 1 (no checks), not 0.

## 5. Docs

- [x] 5.1 `CLAUDE.md`: replace the Definition of Done TODO with the watch-and-merge and watch-`main` commands. Replace the hook TODO with a reference to `.claude/settings.json` and its limits. Add `scripts/` to Testing if needed.
- [x] 5.2 README: CI badge.
- [x] 5.3 PR Test Plan (OS per item), self-review, fix findings. Merge with `watch-pr.mjs && gh pr merge`, then watch `main`. → Self-review found that a just-pushed commit could be merged on the previous commit's green checks; fixed with `--head` + `--match-head-commit` (174a1cf).
