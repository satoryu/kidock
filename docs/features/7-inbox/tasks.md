# Issue #7 — Tasks

Complete in order, with TDD for logic.

## 1. Backend

- [ ] 1.1 `domain::inbox::apply` (all table rows).
- [ ] 1.2 Store migration v3 and `record_changes` / `list_inbox` / `unread_counts` / `mark_read` / `mark_all_read` (incl. cascade on project removal, ordering, limit).
- [ ] 1.3 `AppSink` (record, then emit). Detector integration test: changes land in the Inbox, and the baseline records nothing.
- [ ] 1.4 Commands + IPC test.

## 2. Frontend

- [ ] 2.1 API (`tauriApi` + mock with the same rules).
- [ ] 2.2 `formatRelative`.
- [ ] 2.3 `InboxList` (items, kind icon, unread, selection, mark all as read, empty state).
- [ ] 2.4 Sidebar badges; `App` wiring (refetch on changes, mark read on open from the Inbox or the tree, project removal).

## 3. Verification and docs

- [ ] 3.1 All checks pass; browser check with the mock (headless Chrome); real app on macOS (`tauri dev`): changes → `inbox_items` rows, restart keeps them.
- [ ] 3.2 `CLAUDE.md` updates. PR, self-review, merge through the CI gate.
