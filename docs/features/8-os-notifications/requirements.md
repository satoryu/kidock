# Issue #8 — Requirements: OS notifications

## Problem Statement

The Inbox (#7) only helps when Kidock is on screen. Agents finish work while the owner is elsewhere, so new Inbox items should raise an **OS notification**.

## Requirements

### Functional

- **F1 — Trigger**: a detector batch that creates or updates `.md` files raises a notification. Deletions do not.
- **F2 — Content**:
  - **One file**: the title is "New: `report.md`" or "Updated: `report.md`", and the body is the project name (plus the folder for nested files).
  - **Several files**: the title is "`N` files changed", and the body lists up to three names ("a.md, b.md and 2 more"), followed by the project name when they all share one project, or "in `K` projects".
- **F3 — Burst coalescing**: batches arriving within a short window (2 s after the first) merge into **one** notification. An agent writing 20 files produces one summary.
  - The same file appearing twice in a window counts once.
  - An atomic save is already one change (#6), so it produces at most one notification.
- **F4 — Suppressed while the window is focused**: the Inbox already shows the change, so no OS notification is shown then.
- **F5 — Click**: clicking a notification brings Kidock to the front.
  - A single-file notification opens that file in the main area, marks it read, and selects the Inbox.
  - A summary selects the Inbox.
  - Platform limits: on Windows a click is reported only while the toast is on screen.
- **F6 — Toggle**: notifications can be turned off and on from the sidebar (a bell button). The setting persists (SQLite `settings` table) and defaults to on.
- **F7 — Startup rescan**: changes found at startup (made while Kidock was closed) produce one summary notification, following the same rules.

### Non-Functional

- **N1 — Permissions**: desktop notifications need no runtime permission prompt with `tauri-plugin-notification` 2.8 (`permission_state()` always returns `Granted` on desktop). macOS may still ask the user the first time; that is the OS's own prompt. Notifications are sent from Rust, so the WebView gets no notification capability.
- **N2 — Non-blocking**: the detector thread hands batches to a notifier thread, so notification delivery never delays detection.

## Constraints

- No sounds, and no per-project notification rules.
- Linux is best effort.

## Acceptance Criteria

- **AC1**: In normal use, one notification per changed file. A burst produces one summary.
- **AC2**: An atomic save produces exactly one notification (manual watch scenario step 3).
- **AC3**: The toggle turns notifications off and on and persists across restarts.
- **AC4**: Clicking a single-file notification opens that file. Verified on macOS; Windows by the owner.
- **AC5**: The permission prompt (if any) and the appearance are verified on macOS and Windows. Windows is verified by the owner (`CLAUDE.md`: OS notification differences).

## User Stories

- As the owner, I get a notification when an agent writes a report while I'm in another app.
- As the owner, a burst of agent output gives me one notification, not twenty.
- As the owner, I can silence Kidock when I need to focus.
