# Issue #6 — Tasks

Complete in order, with TDD for logic.

## 1. Domain

- [x] 1.1 `fnv1a64` (published test vectors).
- [x] 1.2 Temp/backup patterns in `ExclusionRules`; `is_tracked`.
- [x] 1.3 `FileState`, `ChangeKind`, `decide`, `needs_hash`.

## 2. Infra

- [x] 2.1 Store migration v2 (`files`, `projects.baselined`), file-state methods, v1 → v2 upgrade test, cascade on project delete.
- [x] 2.2 `scan::walk` / `scan::observe`.
- [x] 2.3 `Detector` (Paths / Baseline / Rescan / Forget) with a collecting sink; synthetic tests including directory removal and moves.
- [x] 2.4 `Watchers` (notify-debouncer-full) and `TauriSink`.
- [x] 2.5 Real-watcher integration tests (`tests/watch.rs`).

## 3. Wiring

- [x] 3.1 `Arc<AppState>`, detector thread and watchers in `setup`; baseline/rescan at startup; add/remove hooks.

## 4. Frontend

- [ ] 4.1 `onChanges` in `KidockApi` (`tauriApi` via `listen`, `mockApi.emitChanges`). Verify the capability.
- [ ] 4.2 Tree refresh on changes, keeping expansion.

## 5. Verification and docs

- [ ] 5.1 All checks pass. Manual scenario steps 1–6 on macOS via `tauri dev` (backend log / event).
- [ ] 5.2 `CLAUDE.md` updates. PR, self-review, merge through the CI gate.
