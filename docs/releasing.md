# Releasing Kidock

Releases are built and published by `.github/workflows/release.yml` when a version tag is pushed (#23).

## Procedure

1. On a branch, set the new version and open a PR:

   ```bash
   npm run version:set -- 0.2.0
   ```

   This updates `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `package-lock.json`, and `Cargo.lock`.
2. Merge the PR through the usual CI gate.
3. Tag the merge commit on `main` and push the tag:

   ```bash
   git switch main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. Watch the **Release** workflow. When it finishes, the release is public at <https://github.com/satoryu/kidock/releases>.

A tag with a pre-release suffix, such as `v0.2.0-rc.1`, is published as a **pre-release**. Its version must also be set with `version:set -- 0.2.0-rc.1`.

## What the workflow does

| Job | What it does |
|---|---|
| `prepare` | `scripts/release-check.mjs` checks that the tag equals the version in all three files. Then it checks that the tagged commit is on `main`, and creates a **draft** release. The draft's notes are generated from the PRs merged since the previous release. |
| `build` ×3 | macOS Apple Silicon (`aarch64-apple-darwin`), macOS Intel (`x86_64-apple-darwin`), and Windows x64. Each job builds with `tauri-apps/tauri-action` and uploads its installers to the draft. On macOS, the job then checks the code signature. |
| `publish` | Runs only if every build succeeded, and publishes the draft. |

Assets:
- macOS: `Kidock_<version>_aarch64.dmg` and `Kidock_<version>_x64.dmg`.
- Windows: `Kidock_<version>_x64-setup.exe` (NSIS) and `Kidock_<version>_x64_en-US.msi`.
- Pre-release tags ship no `.msi`, because WiX accepts only numeric pre-release identifiers.
- tauri-action may also attach the zipped `.app` bundles.

## Release notes

GitHub generates the notes from PR titles, grouped by PR label (`.github/release.yml`):

| Label | Section |
|---|---|
| `enhancement` | Features |
| `bug` | Bug fixes |
| `documentation` | Documentation |
| anything else / none | Other changes |
| `skip-changelog` | left out |

Give each PR its Issue's label before merging. A fixed "Install" header comes before the generated notes. You can edit the published release on GitHub at any time.

## When a release fails

Nothing is published if any job fails. To retry:

1. Delete the draft release, if there is one, from the Releases page.
2. Fix the problem in a PR and merge it.
3. Move the tag to the fixed commit and push it again:

   ```bash
   git push origin :refs/tags/v0.2.0   # delete the remote tag
   git tag -f v0.2.0 origin/main
   git push origin v0.2.0
   ```

If only a runner hiccup failed a build, you can use **Re-run failed jobs** on the workflow run. The builds that succeeded have already uploaded to the same draft.

## Code signing (not set up yet)

- **macOS**: builds are **ad-hoc signed** (`bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`). They are not notarized, so on first launch users right-click → **Open**, or allow the app in System Settings → Privacy & Security.
  - To sign and notarize, add the secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, and `APPLE_API_KEY_PATH` (or `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`).
  - Then pass them as `env` to the tauri-action step.
  - Do not add the `env` entries before the secrets exist: an unset secret expands to an empty string.
  - See <https://v2.tauri.app/distribute/sign/macos/>.
- **Windows**: installers are unsigned, so SmartScreen warns on first run (**More info → Run anyway**). See <https://v2.tauri.app/distribute/sign/windows/>.
