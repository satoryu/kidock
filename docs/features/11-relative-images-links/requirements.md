# Issue #11 — Requirements: Relative images and in-app links

## Problem Statement

Agent reports embed screenshots and diagrams with relative paths (`![](./img/a.png)`) and link to each other (`[details](../plan.md)`). Today images are broken and links are inert.

## Requirements

### Functional

- **F1 — Relative images**:
  - `<img>` sources that are relative paths resolve against the **displayed `.md` file's directory** and load from the file's project.
  - Root-relative sources (`/img/a.png`) resolve against the project folder.
  - Supported types: png, jpg/jpeg, gif, webp, avif, svg, bmp, ico.
- **F2 — Containment**: a resolved image path must stay inside the project. `../` beyond the project root, absolute filesystem paths, and symlinks that escape the project are not served.
- **F3 — Remote and data images**: `http(s):` images are not loaded (privacy: no tracking pixels from agent output) and show a muted placeholder. Inline `data:` images keep working.
- **F4 — Links to `.md` files**:
  - A relative link to a `.md` file (optionally with `#anchor`) opens that file in the main area of the same project.
  - It also selects it in the tree if the project view is open, and marks it read (like any open).
  - A link to a missing file shows the viewer's "no longer exists" state.
- **F5 — Anchors**:
  - Headings get GitHub-style ids (`## Next steps` → `#next-steps`; duplicates get `-1`, `-2`).
  - `#anchor` links scroll within the document.
  - A cross-file link with an anchor opens the file, then scrolls to the anchor.
- **F6 — External links**: `http(s)` links open in the OS default browser on click. The WebView never navigates away.
- **F7 — Other links**: `mailto:` opens the mail client (allowed by the sanitizer since #1). Links to other local files (non-`.md`) are inert and show their target as a tooltip.

### Non-Functional

- **N1 — Security**:
  - Images are served by a Kidock URI scheme (`kidock-asset`) whose Rust handler checks the project id, `RelPath` and canonical containment, which is the same rule as `read_markdown`.
  - The WebView is given no `opener` permission. External URLs go through a Kidock command that accepts only `http`/`https`.
  - The CSP gains the scheme's origins only (`kidock-asset:` and `http://kidock-asset.localhost`).
- **N2 — Paths**: `/`-separated in the UI, percent-decoded in Rust, and `RelPath` normalizes separators. Works with spaces and non-ASCII names on both OSes.

## Constraints

- No image zoom/lightbox.

## Acceptance Criteria

- **AC1**: Relative images in nested folders render. A `../../` path that escapes the project does not load.
- **AC2**: `.md` links navigate inside the app; anchors scroll; external links open in the browser.
- **AC3**: Remote images do not load.
- **AC4**: Verified on macOS (real app) and in CI on Windows (URL format `http://kidock-asset.localhost/...`).

## User Stories

- As the owner, I see the screenshots an agent put next to its report.
- As the owner, I follow links between an agent's reports without leaving Kidock.
