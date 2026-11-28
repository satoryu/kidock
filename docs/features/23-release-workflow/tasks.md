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
- [ ] 4.1 End-to-end on GitHub after the merge. The workflow runs only from tags on `main`, so this cannot happen before merging.
  - Bump to `0.1.1-rc.1` in a PR, merge it, then push the tag `v0.1.1-rc.1`.
  - Check the pre-release flag, the assets (2 × `.dmg` + `-setup.exe`, no `.msi`), the notes and install header, and the `Signature=adhoc` log line.
  - The owner chose to keep the pre-release published.
