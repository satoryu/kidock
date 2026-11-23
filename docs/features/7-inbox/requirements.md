# Issue #7 — Requirements: Inbox

## Problem Statement

#6 detects every real change to `.md` files, but the owner cannot see the changes yet. The Inbox is an email-style list of changed files across all projects, newest first, with read/unread state. It is the core of Kidock ("the dock where your agents' work arrives").

## Decisions (agreed with the owner in #7's discussion)

- **Read/unread**: items have read/unread state. Opening an item marks it read. "Mark all as read" is available.
- **One item per file**: a new change replaces the file's item and moves it to the top.
- **Persistence**: items and read state survive restarts (SQLite).
- **Project removal** deletes its items. Files on disk are untouched.

Decided during design while the owner was away (open for review):
- An unread `created` item stays `created` when the file is updated again before it is read.
- A deleted file's item is removed (the Inbox lists existing files only).
- The list shows the newest 500 items.

## Requirements

### Functional

- **F1 — Recording**: every `created` / `updated` change from the detector (#6) upserts the file's Inbox item.
  - The item records the change kind, the time of the change, and `unread`.
  - **Unread + another change**: stays unread and moves to the top. The kind becomes `updated`, except that an unread `created` stays `created`: the owner hasn't seen the file at all yet.
  - **Read + another change**: becomes unread with the new kind and moves to the top.
  - **`deleted`**: removes the item. The Inbox lists only existing files.
  - The baseline (#6) records nothing. The startup rescan records changes made while Kidock was closed.
- **F2 — Sidebar badges**:
  - The **Inbox** entry shows the total unread count.
  - Each project row shows its own unread count.
  - Counts of 0 are hidden, and counts above 99 show as "99+".
- **F3 — Inbox list (center bar, when Inbox is selected)**, newest first. Each item shows:
  - the file name
  - its project's name (plus the folder path inside the project when the file is not at the top level)
  - an icon/label for **created** ("New") vs. **updated** ("Updated")
  - a relative time ("just now", "5 min ago", "3 h ago", "yesterday", a date for older), with the full timestamp as a tooltip
  - Unread items are bold with a dot.
- **F4 — Opening an item**: clicking (or Enter/Space) renders the file in the main area and marks the item read. If the file no longer exists, the viewer shows its "no longer exists" state.
- **F5 — Opening from the tree**: opening a file from a project tree also marks its Inbox item read, if it has one.
- **F6 — Mark all as read**: a button in the Inbox header, disabled when nothing is unread.
- **F7 — Live updates**: the list and the badges update when changes arrive (`kidock://changes`), when items are read, and when a project is removed.
- **F8 — Empty state**: "No notifications yet." when there are no items.

### Non-Functional

- **N1 — Scale**: the list shows the newest 500 items; older ones are kept and counted but not listed. Counts are aggregated in SQLite, with indexes on `(changed_at)` and `(read)`.
- **N2 — Ordering is stable**: newest first by `changed_at`, ties broken by project id and path.
- **N3 — Consistency**: items are written before the change event is emitted, so a refetch triggered by the event sees them.

## Constraints

- No OS notifications (#8) and no auto re-render of the open file (#9).
- No filtering or search.

## Acceptance Criteria

- **AC1**: A new or updated `.md` in any project appears at the top of the Inbox as unread, and the badges increment.
- **AC2**: Repeated saves of one file leave exactly one item.
- **AC3**: Opening an item marks it read and decrements the badges. "Mark all as read" clears them.
- **AC4**: State survives a restart. Removing a project removes its items and updates the counts.
- **AC5**: Manual watch scenario step 7 (`CLAUDE.md`) passes on macOS, as far as it can be checked without UI automation.

## User Stories

- As the owner, I glance at the Inbox badge to know whether agents produced anything new.
- As the owner, I go through the new files newest first, and each one I open stops counting as unread.
