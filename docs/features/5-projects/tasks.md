# Issue #5 — Tasks

Complete in order, with TDD for logic.

## 1. Backend domain

- [x] 1.1 `project_name` (trim, fallback, 100-char limit at a char boundary).
- [x] 1.2 `check_overlap` (equal, inside, contains, siblings with a shared prefix, case-insensitive mode).
- [x] 1.3 `DomainError`: replace `NoRootSelected` with `ProjectNotFound`; add `AlreadyRegistered`, `OverlapsProject`, `Storage`. Drop `RootId`.

## 2. Backend infra and state

- [x] 2.1 Add `rusqlite` (`bundled`). `Store` with migration v1 and CRUD (in-memory tests, plus a file-backed reopen test).
- [x] 2.2 `AppState::load`: available vs. missing folders.
- [x] 2.3 Commands `list_projects` / `add_project` / `remove_project` / `list_dir` / `read_markdown` with `do_*` tests (unknown id, removed id, traversal, overlap, name fallback, sorting).
- [x] 2.4 `lib.rs` setup: app data dir, DB, asset scope for available projects.

## 3. Frontend

- [ ] 3.1 API types, `tauriApi` (mockIPC tests for command names and args), `mockApi` with projects.
- [ ] 3.2 `Modal`, `AddProjectDialog` (name fallback is server-side; disabled Add; errors stay in the dialog; Escape/Cancel).
- [ ] 3.3 `Sidebar` + `ProjectMenu` + `ConfirmDeleteDialog`.
- [ ] 3.4 `CenterBar` (Inbox placeholder, tree, unavailable state), plus `Tree`/`Viewer` with `projectId`.
- [ ] 3.5 `App` wiring and the three-pane CSS.

## 4. Verification and docs

- [ ] 4.1 All checks pass (cargo test/clippy/fmt, npm test/typecheck/build).
- [ ] 4.2 Browser check with the mock API (headless Chrome): add, delete, tree, viewer, independent scrolling.
- [ ] 4.3 Real app on macOS (`tauri dev`): add two projects, restart (state persists), delete one, check that the files are untouched.
- [ ] 4.4 Update `CLAUDE.md` (layering/state notes, DB location) if needed. PR, self-review, merge through the CI gate.
