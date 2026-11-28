# Issue #23 — Tasks

- [x] 1.1 `scripts/lib/version.mjs`: parse a tag, read and rewrite the version in the three files, check for mismatches (unit tests in the `scripts` project).
- [x] 1.2 `scripts/release-check.mjs` and `scripts/set-version.mjs` + `npm run version:set` (CLI tests spawn the scripts).
- [x] 2.1 `.github/workflows/release.yml` (prepare / build matrix / publish) and `.github/release.yml`. Create the `skip-changelog` label. Set `bundle.macOS.signingIdentity: "-"`.
- [x] 2.2 Verify before merging:
  - [x] Both YAML files parse. `actionlint` is not installed here; GitHub validates the workflow on the first tag push (4.1).
  - [x] `gh api …/releases/generate-notes` with `configuration_file_path=.github/release.yml` shows the categories.
  - [x] A real `npm run version:set -- 0.1.1-rc.1` updates the five files, with a one-line diff in each lockfile. `release-check` then accepts `v0.1.1-rc.1`. The bump was reverted afterwards.
  - [x] The local `tauri build` is blocked on this Mac: the Xcode license has not been accepted. The signature is therefore checked by a workflow step (`codesign --verify`, then `codesign -dv`) on both macOS runners, and a failed check blocks publishing.
- [x] 3.1 `docs/releasing.md`, the README "Install" section, `CLAUDE.md` (Releases: PR labels, procedure). Then the PR, self-review, and merge through the CI gate.
- [x] 4.1 End-to-end on GitHub after the merge (run 46137614173, `v0.1.1-rc.1`): every job succeeded.
  - The release is published as a pre-release, "Kidock 0.1.1-rc.1".
  - Assets: `Kidock_0.1.1-rc.1_aarch64.dmg`, `Kidock_0.1.1-rc.1_x64.dmg`, `Kidock_0.1.1-rc.1_x64-setup.exe`, plus the two `.app.tar.gz` bundles. No `.msi`, as designed for a pre-release.
  - The notes have the Install header, then "Features" (#24) and "Other changes" (the older, unlabelled PRs). #25 is excluded (`skip-changelog`).
  - `codesign` on both macOS runners shows `Signature=adhoc`, and `--verify --deep --strict` passes.
  - The owner chose to keep the pre-release published.
