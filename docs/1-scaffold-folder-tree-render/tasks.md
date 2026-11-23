# Issue #1 — Tasks

Complete in order. Follow TDD (write a failing test first) for every task that contains logic.

## 1. Scaffold

- [x] 1.1 Check the current `create-tauri-app` CLI options (`npm create tauri-app@latest -- --help`) and scaffold React + TypeScript + npm into a temp dir. Move the files into the repo (keeping `CLAUDE.md`, `README.md`, `LICENSE`, `.gitignore`, `docs/`).
- [x] 1.2 Remove template demo code (greet command, logos). Set the app name/identifier (`Kidock`, e.g. `io.github.satoryu.kidock`).
- [x] 1.3 Create the Rust module skeleton: `domain/`, `infra/`, `commands/`, `state.rs`.
- [x] 1.4 Set up tooling: Vitest + Testing Library + jsdom; `npm test` / `npm run test:watch` / `npm run typecheck` scripts; `cargo clippy -D warnings` and `cargo fmt` pass on the skeleton.
- [ ] 1.5 Confirm `npm run tauri dev` launches an empty window on macOS.

## 2. Domain (Rust, pure)

- [x] 2.1 `RelPath::parse`: accepts `""`, `a`, and `a/b.md`; rejects absolute paths, `..`, Windows drive/UNC prefixes, and backslash traversal. Round-trips with `to_wire`.
- [x] 2.2 `ExclusionRules` defaults: `.git`, `node_modules`, and dot-entries are excluded. `is_markdown` is case-insensitive.
- [x] 2.3 Sorting: directories first, then case-insensitive name order.
- [x] 2.4 `DomainError` + serializable `CommandError { kind, message }`.

## 3. Infra + Commands (Rust)

- [x] 3.1 `RootFolder` creation: canonicalize, reject non-directories (temp-dir tests).
- [x] 3.2 `RootFolder::resolve`: inside-root paths succeed; a symlink escaping the root is rejected (temp-dir test, Unix only with `#[cfg(unix)]`, Windows case noted).
- [x] 3.3 `fs_reader::list_dir`: one level, filtered and sorted (temp-dir test, including a 1,000-file directory).
- [x] 3.4 `fs_reader::read_text`: reads UTF-8; maps NotFound, NotUtf8, and non-`.md` to domain errors.
- [x] 3.5 Commands `set_root`, `list_dir`, `read_markdown` wired to `AppState`. `NoRootSelected` before `set_root`.
- [x] 3.6 Asset scope: enable the `protocol-asset` feature and call `asset_protocol_scope().allow_directory(root, true)` in `set_root`.
- [x] 3.7 Security config: CSP, `freezePrototype`, `assetProtocol` (empty scope). Capabilities limited to `core:default` + `dialog:allow-open`. Verify the keys against the generated schema.

## 4. Frontend

- [x] 4.1 `api/` interface, types, `tauriApi`, `mockApi`, and selection via `VITE_API_MOCK`. Test `tauriApi` with `mockIPC` (correct command names and args, error mapping).
- [x] 4.2 `markdown/render.ts`: GFM (table, task list, strikethrough, autolink) and highlighted fences with fallback for unknown languages.
- [x] 4.3 Sanitization tests: `<script>`, `onerror`, `javascript:` links, `<iframe>`, and `<style>` are stripped. Shiki styles are preserved.
- [x] 4.4 `TreeNode`: lazy expansion calls `listDir` once per expand; renders dirs and files; selection callback.
- [x] 4.5 `Viewer`: renders the selected file; empty state (no folder, no `.md`); error states by `CommandError.kind`; link clicks are inert.
- [x] 4.6 `App` / `Sidebar`: Open folder → `setRoot` → root `listDir`. Picking a new folder resets the selection.
- [x] 4.7 Minimal styling: two-pane layout, light/dark following the OS.

## 5. Verification & Docs

- [x] 5.1 Browser check with `VITE_API_MOCK=true` on the Vite dev server (Chrome tools): tree, rendering, XSS sample, and error states.
- [ ] 5.2 Real app check on macOS (`tauri dev`, computer-use): AC1–AC4 and AC6 with a scratch folder (including `.git`, `node_modules`, a dot-file, a 1,000-file dir, and an XSS sample `.md`).
- [ ] 5.3 Windows: try `cargo check --target x86_64-pc-windows-msvc` locally. If that is not possible, record it as deferred to #2 CI.
- [x] 5.4 Update `CLAUDE.md`: Tech Stacks (finalized), Testing commands, and the dev command in Manual Verification.
- [ ] 5.5 Open the PR with a Test Plan (noting the OS for each item), then self-review and fix findings.
