# Issue #10 — Tasks

- [ ] 1.1 Add `mermaid@12.3.0`. Emit `.mermaid-src` placeholders from the fence renderer.
- [ ] 1.2 `markdown/mermaid.ts`: lazy import, strict config, sequential render, SVG sanitization, error box, stale guard (unit tests with a mocked Mermaid).
- [ ] 1.3 Viewer integration (after insert; re-apply the scroll restore after diagrams) and CSS.
- [ ] 2.1 Browser check (headless Chrome, mock build): samples render, injection sample is inert, invalid sample shows the error, and the production CSP emulation has no script violations; the chunk is not fetched for documents without diagrams.
- [ ] 2.2 Sample content in `sampleFiles.ts`; PR, self-review, merge through the CI gate.
