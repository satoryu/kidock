# Issue #2 — Tasks

Complete in order. Follow TDD (write a failing test first) for every task that contains logic.

## 1. Test setup

- [ ] 1.1 Extend the Vitest `include` to `scripts/**/*.test.mjs` (node environment via a per-file `@vitest-environment node` comment).

## 2. Git add guard

- [ ] 2.1 `findBulkGitAdd` tests first: blocked forms (`-A`, `--all`, `.`, `./`, `:/`, `*`, `-u`, `--update`, `-Av`, `-- .`), chains (`&&`, `;`, `|`, newline), `$( )`, `git -C dir add .`, `VAR=1 git add .`. Allowed: explicit paths, `-p file`, `-N file`, `git status`, `echo "git add ."`, `git commit -m "git add ."`.
- [ ] 2.2 Implement `scripts/lib/gitAddGuard.mjs` (tokenizer + matcher).
- [ ] 2.3 `.claude/hooks/guard-git-add.mjs` entry point (stdin JSON → exit 2 + stderr, or exit 0). Test it by spawning it with sample stdin.
- [ ] 2.4 `.claude/settings.json`: re-check the hook keys (`args`, `timeout`, `onFailure`) against the current hooks docs and the installed Claude Code version. Then add the hook.
- [ ] 2.5 Real check: in this session, `git add .` is blocked and `git add <path>` works (AC4).

## 3. Watch-and-merge

- [ ] 3.1 `evaluateChecks` tests first: all pass; pass + skipping; one fail; cancel; pending; empty; a required OS job missing.
- [ ] 3.2 Implement `scripts/lib/checks.mjs`.
- [ ] 3.3 `scripts/watch-pr.mjs`: wait for checks to appear, `gh pr checks --watch --fail-fast`, re-read the JSON, evaluate, exit code. Supports `--require`. Inject the `gh` runner so the flow is unit-testable (no checks → timeout → exit 1).

## 4. CI

- [ ] 4.1 Add `.nvmrc` (`22`) and `.gitattributes` (`* text=auto eol=lf`). Renormalize if needed.
- [ ] 4.2 `.github/workflows/ci.yml` as designed. Re-check the inputs of each action's current major version (`actions/checkout@v7`, `actions/setup-node@v7`, `dtolnay/rust-toolchain`, `Swatinem/rust-cache@v2`) in their READMEs.
- [ ] 4.3 Open the PR and get CI green on both OSes (AC1). Fix Windows-only failures as they appear.
- [ ] 4.4 AC2 real run: push a deliberately failing test, confirm `watch-pr.mjs` exits non-zero, then revert and confirm it exits 0.

## 5. Docs

- [ ] 5.1 `CLAUDE.md`: replace the Definition of Done TODO with the watch-and-merge and watch-`main` commands. Replace the hook TODO with a reference to `.claude/settings.json` and its limits. Add `scripts/` to Testing if needed.
- [ ] 5.2 README: CI badge.
- [ ] 5.3 PR Test Plan (OS per item), self-review, fix findings. Merge with `watch-pr.mjs && gh pr merge`, then watch `main`.
