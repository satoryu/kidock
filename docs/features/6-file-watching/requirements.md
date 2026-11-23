# Issue #6 — Requirements: File watching and change detection

## Problem Statement

Kidock must notice when an agent creates or updates a `.md` file in any project, reliably and exactly once per real change. Raw filesystem events are unreliable:

- Atomic saves (write a temp file, then rename it over the target) appear as create/remove/rename sequences that differ per OS and per tool.
- Editors rewrite identical content.
- Temp files fire events before the rename.

This Issue builds the backend change detector that the Inbox (#7), OS notifications (#8), and auto re-render (#9) will consume.

## Requirements

### Functional

- **F1 — Watch**: every available project folder is watched recursively.
  - Watching starts at app start and when a project is added, and stops when the project is removed.
  - Implementation: `notify` 9 + `notify-debouncer-full` 0.8.
- **F2 — Exclusions**: changes under `.git`, `node_modules`, and hidden files/folders are ignored, and so are temp/backup-looking names (`*~`, `*.tmp`, `*.temp`, `*.swp`, `*.swo`, `*.part`, `*.crdownload`). Only `.md` files (case-insensitive) count. The rules are the same as the tree's, defined in one place.
- **F3 — Change detection by state, not by event kind**: debounced events only nominate paths to re-check. Each path is compared against its last known state `(size, mtime, content hash)`:
  - a `.md` path not known before → **created**
  - a known file whose content hash changed → **updated**
  - a known file that no longer exists (or became excluded / non-Markdown) → **deleted**
  - the same content rewritten (touch, identical save) → no change (the stored mtime is refreshed)
  - an atomic save → exactly one **updated**
  - a rename → **deleted** (old path) + **created** (new path)
  - a directory created, moved in, removed, or moved out → its `.md` files are reconciled recursively
- **F4 — Baseline**: when a project is added, its existing `.md` files are recorded **without** producing changes.
- **F5 — Offline changes**: at startup each available project is rescanned against the stored state. Differences are reported as changes (created/updated/deleted), so nothing written while Kidock was closed is missed.
- **F6 — Rescan on overflow**: if the OS reports dropped events (`need_rescan`) or the watcher errors, the project is fully rescanned.
- **F7 — Output**:
  - Changes are delivered in batches to a `ChangeSink` (an internal trait that #7 will implement to record Inbox items).
  - A Tauri event `kidock://changes` carries `[{ projectId, relPath, kind }]` to the UI.
- **F8 — UI refresh**: the open project tree refreshes when its project changes, keeping expanded folders expanded.
- **F9 — State persistence**: file state lives in SQLite (`files` table, `ON DELETE CASCADE` from `projects`), so removing a project drops its state.

### Non-Functional

- **N1 — Responsiveness**: baselines and rescans run off the main thread. The UI never blocks on them. A project with thousands of files must baseline in seconds.
- **N2 — Debounce**: about 500 ms, so bursts (agents writing many files) arrive as one batch.
- **N3 — Cost**: content is hashed only when size or mtime differ. Hash: 64-bit FNV-1a over the bytes. It is stable across Rust versions, unlike `DefaultHasher`, and good enough for change detection.
- **N4 — Real-filesystem tests**: integration tests drive the real watcher on a temp dir (FSEvents on macOS CI, ReadDirectoryChangesW on Windows CI) for create, in-place update, atomic save, identical rewrite, rename, delete, and excluded paths.

## Constraints

- No Inbox UI or read state (#7), no OS notifications (#8), no re-render of the open file (#9).
- Exclusion patterns are not user-configurable yet (#12).
- A project that is unavailable at startup is not watched. Re-checking availability is a later improvement.

## Acceptance Criteria

- **AC1**: Unit tests cover the reconciliation rules (created, updated, deleted, identical rewrite, rename, excluded, directory moves).
- **AC2**: Real-watcher tests pass on both macOS and Windows CI:
  - an atomic save → exactly one `updated`
  - an identical rewrite → nothing
  - temp/hidden/`.git`/`node_modules` → nothing
- **AC3**: Adding a project with existing files produces no changes. Files changed while the app was closed are reported at the next start.
- **AC4**: The open tree refreshes on changes, keeping expanded folders expanded.
- **AC5**: Manual scenario (`CLAUDE.md` steps 1–6) on macOS: the backend reports correct changes. Without an Inbox UI, they are observed via the `kidock://changes` event and logs.

## User Stories

- As the owner, I want every real change an agent makes to be detected exactly once, so the Inbox is trustworthy.
- As the owner, I want changes made while Kidock was closed to show up when I open it.
