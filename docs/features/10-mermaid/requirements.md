# Issue #10 — Requirements: Mermaid diagrams

## Problem Statement

Agents explain architecture and flows with Mermaid. Kidock currently shows the source code instead of the diagram.

## Requirements

### Functional

- **F1 — Render**: ` ```mermaid ` fences render as diagrams in the main area. Flowchart, sequence, class, state, ER, gantt, and pie diagrams are smoke-tested.
- **F2 — Theme**: diagrams follow light/dark mode at render time.
- **F3 — Errors**: an invalid diagram shows an inline error box with the message and the source. The rest of the document renders normally.
- **F4 — Lazy loading**: Mermaid is downloaded only when a document contains a Mermaid fence. Documents without diagrams load no Mermaid code.
- **F5 — Re-render**: diagrams re-render when the file re-renders (#9). Rendering is keyed per load, so stale renders never land.

### Non-Functional

- **N1 — Security** (`CLAUDE.md`: Mermaid labels are an attack surface):
  - `securityLevel: "strict"` and `htmlLabels: false`, so labels are SVG text, not HTML.
  - The generated SVG is sanitized again with DOMPurify's SVG profile before insertion. No `foreignObject`, scripts, or event handlers survive.
  - No `unsafe-eval`. Mermaid 12.3.0's distribution contains no `eval` / `new Function` (checked).
  - Diagram `click` callbacks and links are disabled (strict level).
- **N2 — Performance**: diagrams render one after another (Mermaid is not re-entrant).

## Constraints

- No zoom/pan or export.

## Acceptance Criteria

- **AC1**: Flowchart, sequence, and class samples render.
- **AC2**: A sample with script/HTML injection in labels executes nothing and leaves no `<script>`, `on*` attributes, or `foreignObject` in the DOM, under the production CSP emulation.
- **AC3**: An invalid diagram shows an error box and the page still renders.
- **AC4**: The Mermaid chunk is not loaded for documents without diagrams.

## User Stories

- As the owner, I see the agent's architecture diagram instead of its source.
