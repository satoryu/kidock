# Issue #10 — Tasks

- [x] 1.1 Add `mermaid@12.3.0`. Emit `.mermaid-src` placeholders from the fence renderer.
- [x] 1.2 `markdown/mermaid.ts`: lazy import, strict config, sequential render, SVG sanitization, error box, stale guard (unit tests with a mocked Mermaid).
- [x] 1.3 Viewer integration (after insert; re-apply the scroll restore after diagrams) and CSS.
- [x] 2.1 Browser check (headless Chrome, mock build): samples render, injection sample is inert, invalid sample shows the error, and the production CSP emulation has no script violations; the chunk is not fetched for documents without diagrams. → Without `freezePrototype`: 4 SVGs, an error box for the invalid sample, an inert injection sample, no dialogs. **With `freezePrototype` (the shipped setting) Mermaid cannot load** (dayjs override mistake) and diagrams show error boxes. See the open decision in design.md. The chunk is not fetched for documents without diagrams.
- [ ] 2.2 Sample content in `sampleFiles.ts`; PR, self-review, merge through the CI gate. → PR open; **merge waits for the owner's decision** on `freezePrototype` (design.md).
