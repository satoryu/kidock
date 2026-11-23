# Issue #8 — Tasks

Complete in order, with TDD for logic.

## 1. Backend

- [x] 1.1 `domain::notice` — `dedupe`, `summarize` (one file, nested folder, several in one project, several projects, more than 3 names, deletions only).
- [x] 1.2 Store migration v4 (`settings`) and get/set.
- [x] 1.3 `Notifier` thread with coalescing window and `Presenter` trait (fake presenter tests: one window → one notice; disabled/focused → none).
- [x] 1.4 `TauriPresenter` (plugin, focus check, settings, id → target, tap → focus + `kidock://open`); `AppSink` forwards batches; setup wiring; plugin added.
- [x] 1.5 Commands `get/set_notifications_enabled` + IPC test.

## 2. Frontend

- [x] 2.1 API (`tauriApi`, mock): toggle and `onOpenRequest`.
- [x] 2.2 Sidebar bell toggle; `App` handles open requests.

## 3. Verification and docs

- [x] 3.1 All checks pass. Real app on macOS: a notification appears for a new file while unfocused, a burst gives one summary, the toggle persists, a click opens the file. Windows appearance/click: owner check. → 121 Rust unit tests (notice wording, coalescing with a fake presenter, settings) + IPC + watcher tests; 157 frontend tests. Real app (`tauri dev`, macOS): schema v4; a single change and a 5-file burst reached the Inbox and the notifier with no errors. Whether a banner appears, how it looks, and what a click does cannot be observed here (no screen access): **owner check** on macOS and Windows.
- [ ] 3.2 `CLAUDE.md`, PR, self-review, merge through the CI gate.
