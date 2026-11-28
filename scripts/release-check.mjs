#!/usr/bin/env node
// Release guard (#23): fails unless the tag's version equals the version in
// package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json.
//
//   node scripts/release-check.mjs v0.2.0 [--github-output]
//
// With --github-output, also appends `version=` and `prerelease=` to
// $GITHUB_OUTPUT for later workflow steps.
import { appendFileSync, readFileSync } from "node:fs";
import { VERSION_FILES, checkVersions, parseTag, readVersions } from "./lib/version.mjs";

const args = process.argv.slice(2);
const githubOutput = args.includes("--github-output");
const positional = args.filter((a) => a !== "--github-output");
if (positional.length !== 1) {
  console.error("usage: node scripts/release-check.mjs <tag> [--github-output]");
  process.exit(2);
}

try {
  const { version, prerelease } = parseTag(positional[0]);
  const root = new URL("../", import.meta.url);
  const read = (rel) => readFileSync(new URL(rel, root), "utf8");
  const versions = readVersions({
    packageJson: read(VERSION_FILES.packageJson),
    cargoToml: read(VERSION_FILES.cargoToml),
    tauriConf: read(VERSION_FILES.tauriConf),
  });
  const problems = checkVersions(version, versions);
  if (problems.length > 0) {
    console.error(`Tag ${positional[0]} does not match the app version:`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`Bump it with \`npm run version:set -- ${version}\` in a PR, merge, then tag again.`);
    process.exit(1);
  }
  if (githubOutput) {
    if (!process.env.GITHUB_OUTPUT) throw new Error("--github-output needs $GITHUB_OUTPUT");
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nprerelease=${prerelease}\n`);
  }
  console.log(`OK: ${version}${prerelease ? " (pre-release)" : ""}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
