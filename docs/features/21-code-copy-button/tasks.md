# Issue #21 — Tasks

- [x] 1.1 Backend: `tauri-plugin-clipboard-manager` 2.5, `ClipboardWriter` + `TauriClipboard`, `copy_text` / `do_copy_text` (unit tests with a fake writer), IPC test.
- [x] 2.1 API: `copyText` in `KidockApi`, `tauriApi` (mockIPC test), and `mockApi`.
- [x] 2.2 `markdown/codeCopy.ts`: `codeText` and `addCopyButtons` (unit tests: Shiki, plain, and raw `<pre>` blocks; Mermaid skipped; idempotent).
- [x] 2.3 Viewer integration, feedback message, and CSS (Viewer tests: copy, success and failure messages, timer, re-render).
- [x] 3.1 All checks pass. Browser check with the mock (button position, horizontal scroll, message, both themes). Real app (macOS): the clipboard really receives the text (`pbpaste`). → 137 Rust unit + IPC + watcher tests; 220 frontend tests; clippy, fmt, typecheck, build. Headless Chrome (mock, 1200×800): all 5 blocks have the button 8 px from the top-right; clicking copies the exact source and shows "Copied" over that block, which is gone after 2 s; the button stays put while a long line scrolls sideways; light and dark themes look right; no page errors. This check found that a long code line made the article overflow narrow panes and hid the buttons (fixed with an explicit width). Real clipboard (macOS): the ignored IPC test sent `copy_text` through the command and the plugin, and `pbpaste` returned the exact text. The owner's clipboard was restored afterwards. Clicking in the native window is left to the owner.
- [ ] 3.2 `CLAUDE.md`, PR, self-review, merge through the CI gate.
