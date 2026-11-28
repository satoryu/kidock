# Issue #21 — Tasks

- [x] 1.1 Backend: `tauri-plugin-clipboard-manager` 2.5, `ClipboardWriter` + `TauriClipboard`, `copy_text` / `do_copy_text` (unit tests with a fake writer), IPC test.
- [x] 2.1 API: `copyText` in `KidockApi`, `tauriApi` (mockIPC test), and `mockApi`.
- [x] 2.2 `markdown/codeCopy.ts`: `codeText` and `addCopyButtons` (unit tests: Shiki, plain, and raw `<pre>` blocks; Mermaid skipped; idempotent).
- [ ] 2.3 Viewer integration, feedback message, and CSS (Viewer tests: copy, success and failure messages, timer, re-render).
- [ ] 3.1 All checks pass. Browser check with the mock (button position, horizontal scroll, message, both themes). Real app (macOS): the clipboard really receives the text (`pbpaste`).
- [ ] 3.2 `CLAUDE.md`, PR, self-review, merge through the CI gate.
