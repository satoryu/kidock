# Issue #8 — Tasks

Complete in order, with TDD for logic.

## 1. Backend

- [ ] 1.1 `domain::notice` — `dedupe`, `summarize` (one file, nested folder, several in one project, several projects, more than 3 names, deletions only).
- [ ] 1.2 Store migration v4 (`settings`) and get/set.
- [ ] 1.3 `Notifier` thread with coalescing window and `Presenter` trait (fake presenter tests: one window → one notice; disabled/focused → none).
- [ ] 1.4 `TauriPresenter` (plugin, focus check, settings, id → target, tap → focus + `kidock://open`); `AppSink` forwards batches; setup wiring; plugin added.
- [ ] 1.5 Commands `get/set_notifications_enabled` + IPC test.

## 2. Frontend

- [ ] 2.1 API (`tauriApi`, mock): toggle and `onOpenRequest`.
- [ ] 2.2 Sidebar bell toggle; `App` handles open requests.

## 3. Verification and docs

- [ ] 3.1 All checks pass. Real app on macOS: a notification appears for a new file while unfocused, a burst gives one summary, the toggle persists, a click opens the file. Windows appearance/click: owner check.
- [ ] 3.2 `CLAUDE.md`, PR, self-review, merge through the CI gate.
