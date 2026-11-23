import type { MockSeed } from "./mockApi";

/** Sample content for browser development with the mock API. */
const many = Object.fromEntries(
  Array.from({ length: 1000 }, (_, i) => {
    const n = String(i).padStart(4, "0");
    return [`many/${n}.md`, `# File ${n}\n\nGenerated sample.`];
  }),
);

export const sampleFiles: Record<string, string> = {
  "README.md": `# Kidock sample

This folder is served by the **mock API** for browser development.

## Table

| Feature | Status |
|---|---|
| Tree | ✅ |
| Rendering | ✅ |
| ~~Editing~~ | out of scope |

## Tasks

- [x] Pick a folder
- [x] Show the tree
- [ ] Watch for changes (#3)

## Links

Autolink: https://example.com · [relative](./notes/meeting.md) · [anchor](#table)
`,
  "code/samples.md": `# Code samples

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

\`\`\`rust
fn main() {
    let v: Vec<u32> = (1..=3).collect();
    println!("{v:?}");
}
\`\`\`

\`\`\`sh
npm run tauri dev
\`\`\`

\`\`\`nosuchlang
plain fallback <b>not bold</b>
\`\`\`
`,
  "diagrams/mermaid.md": `# Mermaid samples

## Flowchart

\`\`\`mermaid
graph TD
  A[Agent writes report] --> B{Kidock detects}
  B -->|created| C[Inbox: New]
  B -->|updated| D[Inbox: Updated]
\`\`\`

## Sequence

\`\`\`mermaid
sequenceDiagram
  Agent->>Kidock: report.md
  Kidock-->>Owner: notification
\`\`\`

## Class

\`\`\`mermaid
classDiagram
  class Project { +name +path }
  class InboxItem { +relPath +read }
  Project "1" --> "*" InboxItem
\`\`\`

## Injection attempt (must stay inert)

\`\`\`mermaid
graph LR
  X["<img src=x onerror=alert('mermaid')>"] --> Y["<script>alert('label')</script>"]
  click X "javascript:alert('click')"
\`\`\`

## Invalid diagram

\`\`\`mermaid
graph TD
  this is not --> valid -->
\`\`\`
`,
  "notes/meeting.md": "# 議事録\n\n- 日本語のファイル名と本文の表示確認\n- スペースを含むパスも確認する\n",
  "security/xss.md": `# XSS samples

None of these may execute or keep dangerous attributes.

<script>alert("script tag")</script>

<img src="x" onerror="alert('onerror')">

[javascript link](javascript:alert('md link'))

<a href="javascript:alert('raw link')">raw javascript link</a>

<iframe src="https://example.com"></iframe>

<div style="position:fixed;inset:0;background:red">style overlay</div>

<form><input type="text" value="form"><button>submit</button></form>
`,
  ...many,
};

/** Projects and addable folders for `npm run dev:mock`. */
export const sampleSeed: MockSeed = {
  projects: [
    { name: "Kidock sample", path: "/mock/sample", files: sampleFiles },
    {
      name: "agent-notes",
      path: "/mock/agent-notes",
      files: { "plan.md": "# Plan\n\n- [ ] Ship #5\n", "logs/run-1.md": "# Run 1\n\nAll green." },
    },
    { name: "Moved away", path: "/mock/missing", files: {}, available: false },
  ],
  // Sample Inbox: ids follow the order of `projects` above (1, 2, ...).
  inbox: [
    { projectId: 2, relPath: "plan.md", kind: "created", changedAt: Date.now() - 2 * 60_000, read: false },
    { projectId: 1, relPath: "code/samples.md", kind: "updated", changedAt: Date.now() - 50 * 60_000, read: false },
    { projectId: 2, relPath: "logs/run-1.md", kind: "updated", changedAt: Date.now() - 5 * 3_600_000, read: true },
    { projectId: 1, relPath: "README.md", kind: "created", changedAt: Date.now() - 30 * 3_600_000, read: true },
  ],
  // `pickFolder()` returns "/mock/new-project" by default.
  folders: { "/mock/new-project": { "README.md": "# New project\n\nAdded from the dialog." } },
};
