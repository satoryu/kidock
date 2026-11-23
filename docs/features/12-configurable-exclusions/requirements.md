# Issue #12 — Requirements: Configurable exclusion patterns

## Problem Statement

`CLAUDE.md` design constraint 3 requires the exclusion patterns to be configurable. Today they are hard-coded: `.git`, `node_modules`, hidden entries, and temp suffixes. Projects differ: some agents write scratch folders such as `tmp/` or `.cache`-like names without a dot, and some owners want to see hidden folders.

## Requirements

### Functional

- **F1 — Patterns**: one global list of glob patterns, each matched case-insensitively against **every path component** (file and folder names, gitignore-basename style).
  - `*` matches any run of characters, and `?` matches one character.
  - A match on a folder excludes everything inside it.
- **F2 — Defaults** (equivalent to today's behavior): `.git`, `node_modules`, `.*`, `*~`, `*.tmp`, `*.temp`, `*.swp`, `*.swo`, `*.part`, `*.crdownload`.
- **F3 — Scope**: the same patterns apply to the tree and to change detection (#6), from one place.
- **F4 — Editing UI**: a "Exclusions" button in the sidebar footer opens a dialog.
  - The dialog has a textarea (one pattern per line, blank lines ignored), **Save**, **Cancel**, and **Reset to defaults**.
  - Invalid input is reported in the dialog: a pattern containing `/` or `\`, a pattern that is empty after trimming, or more than 200 patterns.
- **F5 — Persistence**: patterns are stored in SQLite (`settings`, key `exclusions.patterns`, JSON array) and survive restarts. No stored value means the defaults.
- **F6 — Applying a change**:
  - Open trees refresh.
  - Every available project is **silently re-baselined** with the new rules. Newly excluded files are dropped from the tracked state, and newly visible existing files are recorded, **without creating Inbox items or notifications**.
  - Existing Inbox items are left as they are.
- **F7 — Change detection after the change** follows the new rules immediately.

### Non-Functional

- **N1**: pattern matching is linear per name (no regex compilation from user input; no catastrophic backtracking).

## Constraints

- Per-project patterns are out of scope (a later Issue if needed).
- Negation (`!pattern`) is not supported.

## Acceptance Criteria

- **AC1**: Adding a pattern hides the matching files from the tree and stops their changes from reaching the Inbox.
- **AC2**: Removing a pattern makes them visible again without creating Inbox items for files that already existed.
- **AC3**: Patterns survive a restart.

## User Stories

- As the owner, I hide an agent's scratch folder so its churn never reaches my Inbox.
