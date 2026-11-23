# Issue #11 — Tasks

## 1. Rust

- [x] 1.1 `percent_decode` (valid, `%2F`, invalid escapes, invalid UTF-8).
- [x] 1.2 `asset_protocol::serve` (ok, unknown project, escape via `..`, escape via symlink, disallowed extension, missing) + scheme registration.
- [x] 1.3 `open_external` (http/https only) + opener plugin (no WebView capability).
- [x] 1.4 CSP and config: `kidock-asset` origins in; asset protocol out. IPC test.

## 2. Frontend

- [x] 2.1 `resolveRelative` (siblings, `..`, root-relative, escape → null, encoded names).
- [x] 2.2 Heading ids (slug, duplicates, prefix) and the sanitize hook rewriting img/a.
- [x] 2.3 API `assetUrl` / `openExternal`; Viewer click routing and anchor scrolling; App `onOpenLink`.

## 3. Verification and docs

- [x] 3.1 All checks pass. Production CSP emulation still clean. Real app (macOS): an image in a nested folder renders; an escaping image is blocked; links navigate. → 129 Rust unit tests (asset handler: ok, 400/403/404/415 incl. `..` and symlink escapes; percent-decoding; external URL rule), IPC test (`open_external` refuses `javascript:`/`file:`), real-watcher tests; 197 frontend tests (path resolution, heading ids, image/link rewriting, Viewer routing and anchors, App link → open + read). The CSP emulation does not cover the `kidock-asset` scheme (a browser can't serve it), so the image path is covered by the Rust tests. Native-window check of images and links: **owner**.
- [ ] 3.2 `CLAUDE.md` (the asset protocol is replaced by `kidock-asset`). PR, self-review, merge through the CI gate.
