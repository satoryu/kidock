# Issue #7 — Tasks

Complete in order, with TDD for logic.

## 1. Backend

- [x] 1.1 `domain::inbox::apply` (all table rows).
- [x] 1.2 Store migration v3 and `record_changes` / `list_inbox` / `unread_counts` / `mark_read` / `mark_all_read` (incl. cascade on project removal, ordering, limit).
- [x] 1.3 `AppSink` (record, then emit). Detector integration test: changes land in the Inbox, and the baseline records nothing.
- [x] 1.4 Commands + IPC test.

## 2. Frontend

- [x] 2.1 API (`tauriApi` + mock with the same rules).
- [x] 2.2 `formatRelative`.
- [x] 2.3 `InboxList` (items, kind icon, unread, selection, mark all as read, empty state).
- [x] 2.4 Sidebar badges; `App` wiring (refetch on changes, mark read on open from the Inbox or the tree, project removal).

## 3. Verification and docs

- [x] 3.1 All checks pass; browser check with the mock (headless Chrome); real app on macOS (`tauri dev`): changes → `inbox_items` rows, restart keeps them. → 152 frontend tests (+ scripts) and 109 Rust unit tests + IPC + real-watcher tests. Headless Chrome with the mock: list, badges, open → read, mark all as read, dark mode. Real app (`tauri dev`, macOS) with a project registered in the DB:
  - schema v3; the baseline adds nothing
  - a create and an atomic save each give one unread item
  - a re-edit keeps one item, moved to the top and still `created`
  - the Inbox survives a restart
- [ ] 3.2 `CLAUDE.md` updates. PR, self-review, merge through the CI gate.
