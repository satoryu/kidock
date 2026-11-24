# Issue #10 — Tasks

- [x] 1.1 Add `mermaid@12.3.0`. Emit `.mermaid-src` placeholders from the fence renderer.
- [x] 1.2 `markdown/mermaid.ts`: lazy import, strict config, sequential render, SVG sanitization, error box, stale guard (unit tests with a mocked Mermaid).
- [x] 1.3 Viewer integration (after insert; re-apply the scroll restore after diagrams) and CSS.
- [x] 2.1 Browser check (headless Chrome, mock build): samples render, injection sample is inert, invalid sample shows the error, and the production CSP emulation has no script violations; the chunk is not fetched for documents without diagrams. → Without `freezePrototype`: 4 SVGs, an error box for the invalid sample, an inert injection sample, no dialogs. **With `freezePrototype` Mermaid cannot load** (dayjs override mistake) and diagrams show error boxes. Owner chose option B (freeze off); see design.md. The chunk is not fetched for documents without diagrams.
- [x] 2.2 Sample content in `sampleFiles.ts`; PR and self-review. → Owner decision: B; `freezePrototype` set to `false`.
- [x] 2.3 `CLAUDE.md` (freeze-off pitfall); merge through the CI gate.
