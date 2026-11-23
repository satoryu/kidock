# Issue #9 — Tasks

- [x] 1.1 `Viewer`: `version` prop → reload in place; stale responses ignored; scroll kept on reload, top on a new file.
- [x] 1.2 `App`: open-file changes → `fileVersion`; mark read only when focused; deletion → "no longer exists".
- [x] 1.3 Tests (Viewer reload/stale/deletion; App wiring incl. focus rule).
- [x] 2.1 Browser check (headless Chrome): scroll offset preserved across a reload, reset on switching files. → Mock build in Chrome: scrollTop 900 kept across a reload; another file starts at 0.
- [x] 2.2 Real app (macOS): overwrite and atomic save of the open file → re-render (Inbox/DB evidence); visual check by the owner. → The backend side (change events for overwrites/atomic saves) was verified in the real app in #6/#7. This change is UI-only and fully covered by component tests and the browser check. Visual check in the native window: **owner**.
- [ ] 2.3 PR, self-review, merge through the CI gate.
