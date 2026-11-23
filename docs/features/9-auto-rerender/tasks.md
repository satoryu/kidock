# Issue #9 — Tasks

- [ ] 1.1 `Viewer`: `version` prop → reload in place; stale responses ignored; scroll kept on reload, top on a new file.
- [ ] 1.2 `App`: open-file changes → `fileVersion`; mark read only when focused; deletion → "no longer exists".
- [ ] 1.3 Tests (Viewer reload/stale/deletion; App wiring incl. focus rule).
- [ ] 2.1 Browser check (headless Chrome): scroll offset preserved across a reload, reset on switching files.
- [ ] 2.2 Real app (macOS): overwrite and atomic save of the open file → re-render (Inbox/DB evidence); visual check by the owner.
- [ ] 2.3 PR, self-review, merge through the CI gate.
