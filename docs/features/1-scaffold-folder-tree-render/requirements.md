# Issue #1 — Tech stack decision & scaffold: pick one folder → tree view → render .md

## Problem Statement

Kidock has no code yet. Before building watching, unread state, and notifications, we need a finalized tech stack and the thinnest working end-to-end slice that exercises every layer: native folder picking (OS integration), filesystem access in Rust, IPC, a tree UI, and safe Markdown rendering. This slice also establishes the security baseline (CSP, asset scope, sanitization) and the test tooling every later Issue builds on.

## Requirements

### Functional

- **F1. Pick a folder**: the user can choose one folder through the native OS folder dialog. Picking another folder replaces the current one.
- **F2. Tree view**: the sidebar shows the picked folder as a tree containing directories and `.md` files only.
  - Children are loaded lazily when a directory is expanded (not the whole tree up front).
  - Entries are sorted: directories first, then files; each group case-insensitively by name.
  - `.git`, `node_modules`, and hidden entries (name starting with `.`) are not shown.
- **F3. Render Markdown**: selecting a `.md` file renders it in the main pane.
  - GitHub Flavored Markdown: tables, task lists, strikethrough, autolinks.
  - Fenced code blocks are syntax-highlighted.
  - Raw HTML in the Markdown is allowed but sanitized.
- **F4. Empty / error states**: a clear message when no folder is selected, when a folder has no `.md` files, and when a file cannot be read (deleted, permission denied, not UTF-8).

### Non-Functional

- **N1. Security**:
  - Markdown is treated as untrusted. Scripts in it never execute (`<script>`, inline event handlers, `javascript:` URLs, `<iframe>`, `<object>`).
  - A strict CSP is configured in `tauri.conf.json`.
  - The asset protocol scope starts empty and is extended at runtime only to the picked folder.
  - The frontend cannot read files outside the picked folder through any command (path traversal is rejected).
- **N2. Responsiveness**: expanding a directory with 1,000 entries stays interactive (lazy loading; no whole-tree IPC payload).
- **N3. Cross-platform**: builds and runs on macOS. Compiles for Windows (verified by the user or CI in #2). Paths are handled with `std::path`, never by string splitting on `/`.
- **N4. Testability**:
  - Rust domain logic is unit-tested without Tauri or a real filesystem where possible.
  - The frontend talks to the backend only through one API module that can be replaced with a mock, so the UI runs in a plain browser.
- **N5. Tooling**: `cargo test`, `cargo clippy -D warnings`, `cargo fmt --check`, Vitest, and the TypeScript type-check all pass.

## Constraints

- Tauri v2 (2.12.x at the time of writing). Tauri 3 is alpha and is not used.
- Node: Vite 8 requires Node `^20.19.0 || >=22.12.0`.
- No editing features. Files are never written.
- Out of scope for this Issue (later Issues):
  - multiple folders and persisting folders across restarts
  - file watching, unread state, notifications
  - Mermaid, relative images, and in-app `.md` links
  - configurable exclusion patterns
  - CI (#2)

## Acceptance Criteria

- [ ] AC1: On macOS, `tauri dev` launches the app; the user picks a folder and sees its tree with only directories and `.md` files, excluding `.git`, `node_modules`, and dot-entries.
- [ ] AC2: Expanding a directory loads its children on demand. A directory with 1,000 `.md` files expands without freezing the UI.
- [ ] AC3: Clicking a `.md` file renders GFM (table, task list, strikethrough) and a highlighted code block (e.g. `ts`, `rust`).
- [ ] AC4: A Markdown file containing `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, and `[x](javascript:alert(1))` renders without executing anything. The dangerous parts are stripped.
- [ ] AC5: Requesting a path outside the picked folder (e.g. `../../etc/hosts`, or an absolute path) through the backend command returns an error. This is covered by a Rust test.
- [ ] AC6: Error and empty states (F4) are shown instead of crashing.
- [ ] AC7: All Rust and frontend tests and lints pass locally. `cargo check` succeeds for the Windows target or is deferred to #2 CI (state which).
- [ ] AC8: `CLAUDE.md` is updated: Tech Stacks finalized, Testing commands, and the dev command in Manual Verification.

## User Stories

- As a user, I want to pick a folder where my agent writes reports, so that I can browse its Markdown files in one place.
- As a user, I want only Markdown files and folders in the tree, so that build artifacts and VCS internals don't clutter it.
- As a user, I want reports rendered with tables and highlighted code, so that I can read them comfortably.
- As a user, I want to be confident that opening an agent-written file cannot run code on my machine.
