# Issue #12 — Tasks

- [x] 1.1 `glob_match` and pattern-based `ExclusionRules` (defaults equal to today's behavior; validation).
- [x] 1.2 `AppState` rules snapshot + persistence; callers take snapshots.
- [x] 1.3 Commands `get_exclusions` / `set_exclusions` (silent re-baseline) + IPC test; a detector test that re-baselining creates no changes.
- [x] 2.1 API + `ExclusionsDialog` + sidebar button + tree refresh.
- [x] 3.1 All checks pass; real app (macOS): patterns persist across a restart, and re-baselining records no Inbox items. → 135 Rust unit tests + IPC + watcher tests; 201 frontend tests. Real app (`tauri dev`, macOS) with `exclusions.patterns = [\"scratch\"]` stored: the baseline tracked `.notes/h.md` and `a.md` (dot-folders visible without `.*`), skipped `scratch/`, and created 0 Inbox items. The owner's DB was restored afterwards.
- [ ] 3.2 `CLAUDE.md`, PR, self-review, merge through the CI gate.
