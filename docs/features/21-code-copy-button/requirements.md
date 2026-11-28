# Issue #21 — Requirements: Copy button on rendered code blocks

## Problem Statement

Agents often put commands, config snippets, and code in their Markdown deliverables, and the owner wants to paste them into a terminal or an editor. Selecting a block by dragging is slow and error-prone: it is easy to miss the first or last line, or to pick up surrounding text.

## Requirements

### Functional

- **F1 — Button**: every code block in the rendered document has a copy button with a copy icon in its **top-right corner**.
  - It applies to fenced and indented code blocks, with or without a language, and to raw `<pre>` blocks in the document.
  - Mermaid diagrams (and their error boxes) get no button.
  - The button stays in place when the code block scrolls horizontally.
- **F2 — Copy**: clicking the button writes the block's **plain text** to the system clipboard. That is exactly the code as written in the file: no highlighting markup and no line numbers. One trailing newline is dropped.
- **F3 — Feedback**: right after the click, a message is shown **in front of that code block**, for about 1.5 s, then fades out.
  - On success the message is "Copied".
  - On failure it is "Copy failed".
  - Clicking again while the message is shown restarts its timer.
- **F4 — Accessibility**:
  - The button is a real `<button>`, reachable with Tab, with the accessible name "Copy code".
  - The message is announced through `role="status"`.
- **F5 — Read-only**: copying never touches the file and never navigates.

### Non-Functional

- **N1 — Security**:
  - The WebView gets **no clipboard permission**. Copying goes through a Kidock command that can only *write* text, so a compromised page could never read the clipboard.
  - Buttons are added by Kidock's own code after sanitization. The sanitizer still forbids `<button>` and SVG from documents.
- **N2**: adding the buttons is linear in the number of code blocks; documents without code blocks pay nothing.

## Constraints

- The UI is in English, like the rest of Kidock ("Copied", not 「コピーしました」).
- Copying rich text (HTML with colors) is out of scope.

## Acceptance Criteria

- **AC1**: In a document with a `ts` block, a plain block, and a Mermaid diagram, exactly the two code blocks show a copy button at their top-right.
- **AC2**: Clicking a button puts the block's exact source text on the clipboard and shows "Copied" over that block, then the message disappears.
- **AC3**: If the copy fails, "Copy failed" is shown instead.
- **AC4**: The button still works after the open file re-renders because it changed on disk (#9).

## User Stories

- As the owner, I copy the command an agent wrote in its report and paste it into my terminal in one click.
