# Issue #23 — Requirements: Release workflow on version tags

## Problem Statement

Kidock has CI but no way to ship. Installing it today means cloning the repo and running `npm run tauri build`. The owner wants to push a version tag and get a public GitHub Release with installers for macOS and Windows and readable release notes.

## Requirements

### Functional

- **F1 — Trigger**: pushing a tag that matches `v*.*.*` (e.g. `v0.2.0`, `v0.3.0-beta.1`) starts the release workflow. Nothing else starts it.
- **F2 — Version guard**: the workflow fails before building if any of these apply:
  - the tag's version differs from the version in `package.json`, `src-tauri/Cargo.toml`, or `src-tauri/tauri.conf.json`;
  - the tagged commit is not on `main`.
- **F3 — Builds**: macOS Apple Silicon (`aarch64-apple-darwin`), macOS Intel (`x86_64-apple-darwin`), and Windows x64, built in release mode.
- **F4 — Assets**: the Release carries each platform's installers (macOS `.dmg`; Windows `.msi` and NSIS `-setup.exe`). Updater artifacts are out of scope.
- **F5 — Release notes**: generated automatically by GitHub from the PRs merged since the previous release, grouped by label (`.github/release.yml`):
  - Features: `enhancement`
  - Bug fixes: `bug`
  - Documentation: `documentation`
  - Other changes: everything else
  - A short header explains how to install the unsigned builds.
- **F6 — Publishing**: the Release becomes public only after **every** build has uploaded its assets. If any build fails, nothing is published; a draft stays behind for inspection.
  - A tag with a pre-release suffix (`-beta.1`) is published as a pre-release.
- **F7 — Unsigned builds** (owner decision):
  - macOS builds get an ad-hoc signature (`signingIdentity: "-"`). Without it, Apple Silicon reports apps downloaded from the internet as damaged.
  - Windows builds are unsigned.
  - Adding real signing later must only require adding secrets and a config value, not restructuring the workflow.
- **F8 — Version bump helper**: `npm run version:set -- 0.2.0` updates all three version fields (and `Cargo.lock`) in one step, so F2 is easy to satisfy.
- **F9 — Release procedure** is documented: bump the version in a PR, merge, tag `main`, push the tag.

### Non-Functional

- **N1 — Least privilege**:
  - Only the jobs that create or upload the Release get `contents: write`.
  - The build steps do not get the token unless the upload step needs it.
- **N2 — Repository tooling rule**: the version check and the bump helper are Node ESM scripts with their logic in `scripts/lib/`, unit-tested in the `scripts` Vitest project (CLAUDE.md).

## Constraints

- Pinned to verified tool versions: `tauri-apps/tauri-action@v1` (v1.0.0; `includeUpdaterJson` was renamed to `uploadUpdaterJson`).
- Linux builds and auto-update (the Tauri updater plugin) are out of scope.
- No code signing certificates are available yet.

## Acceptance Criteria

- **AC1**: Pushing `vX.Y.Z` on a `main` commit whose three version fields are `X.Y.Z` produces a public Release `Kidock vX.Y.Z` with the macOS arm64 and x64 `.dmg`, the Windows `.msi` and `-setup.exe`, and categorized release notes.
- **AC2**: Pushing a tag whose version does not match fails the workflow, and no Release is published.
- **AC3**: If one platform's build fails, the Release is not published.

## User Stories

- As the owner, I tag a version and get downloadable installers for my work PC (Windows) and my Mac, without building locally.
- As a user, I read the release notes to see what changed.
