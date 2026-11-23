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
