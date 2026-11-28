# Issue #23 — Tasks

- [ ] 1.1 `scripts/lib/version.mjs`: parse a tag, read and rewrite the version in the three files, check for mismatches (unit tests in the `scripts` project).
- [ ] 1.2 `scripts/release-check.mjs` and `scripts/set-version.mjs` + `npm run version:set` (tests for the CLI glue where practical).
- [ ] 2.1 `.github/workflows/release.yml` (prepare / build matrix / publish) and `.github/release.yml`. Create the `skip-changelog` label. Set `bundle.macOS.signingIdentity: "-"`.
- [ ] 2.2 Verify:
  - lint the workflow (`actionlint` if available);
  - `gh api …/releases/generate-notes` shows the categories;
  - local `tauri build` for both macOS targets with ad-hoc signing (`codesign -dv` shows `Signature=adhoc`).
- [ ] 2.3 End-to-end on GitHub: push a pre-release tag (`v0.1.1-rc.1`, after bumping the version) and check the assets, notes, and pre-release flag. Delete it afterwards if the owner prefers.
- [ ] 3.1 `docs/releasing.md`, README "Install", `CLAUDE.md` (PR labels, release procedure). PR, self-review, merge through the CI gate.
