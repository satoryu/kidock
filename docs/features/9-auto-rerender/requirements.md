# Issue #9 — Requirements: Auto re-render the open file

## Problem Statement

Agents often keep rewriting a report while the owner reads it. Today the main area shows a stale copy until the file is clicked again.

## Requirements

### Functional

- **F1 — Re-render**: when the open file is `updated` (or `created`, after an atomic replace) on disk, the main area re-renders it automatically.
- **F2 — Scroll position**: the reading position is kept. The scroll offset of the main area is restored after the new content renders, clamped to the new height.
- **F3 — No flash**: the old content stays on screen until the new HTML is ready, then is swapped in one step.
- **F4 — Deletion**: if the open file is deleted, the main area shows "The file or folder no longer exists."
- **F5 — Read state**: an auto re-render marks the file's Inbox item read **only while Kidock's window has focus**. An update the owner did not actually see stays unread.
- **F6 — New file, new position**: opening a *different* file starts at the top. Today the previous file's scroll offset is inherited, which is a bug.

### Non-Functional

- **N1**: one change event leads to one re-render. Atomic saves are already a single change (#6).
- **N2**: stale responses are ignored. If two updates race, only the latest render wins.

## Constraints

- No smarter anchoring yet (e.g. keeping the nearest heading in view). The absolute offset is the documented rule; anchoring can follow if needed.

## Acceptance Criteria

- **AC1**: An in-place overwrite of the open file re-renders it and keeps the scroll position (manual watch scenario step 2, macOS).
- **AC2**: An atomic save of the open file re-renders it exactly once.
- **AC3**: Deleting the open file shows the "no longer exists" state.
- **AC4**: Switching files starts at the top.

## User Stories

- As the owner, I read a report while the agent is still writing it, and it updates in place without losing my position.
