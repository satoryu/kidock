#!/usr/bin/env node
// Sets the app version everywhere it lives (#23):
//
//   npm run version:set -- 0.2.0
//
// Rewrites package.json, src-tauri/Cargo.toml ([package] only), and
// src-tauri/tauri.conf.json, then refreshes package-lock.json and Cargo.lock.
// Options (mainly for tests): --root <dir>, --no-lockfiles.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION_FILES, parseVersion, setCargoTomlVersion, setJsonVersion } from "./lib/version.mjs";

const args = process.argv.slice(2);
let root = fileURLToPath(new URL("../", import.meta.url));
let lockfiles = true;
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--root") root = resolve(args[++i] ?? "");
  else if (args[i] === "--no-lockfiles") lockfiles = false;
  else positional.push(args[i]);
}
if (positional.length !== 1) {
  console.error("usage: npm run version:set -- <MAJOR.MINOR.PATCH[-PRERELEASE]>");
  process.exit(2);
}

try {
  const { version } = parseVersion(positional[0]);
  const edits = [
    [VERSION_FILES.packageJson, setJsonVersion],
    [VERSION_FILES.cargoToml, setCargoTomlVersion],
    [VERSION_FILES.tauriConf, setJsonVersion],
  ];
  // Compute every edit before writing, so a failure leaves all files untouched.
  const updated = edits.map(([rel, set]) => [rel, set(readFileSync(join(root, rel), "utf8"), version)]);
  for (const [rel, text] of updated) {
    writeFileSync(join(root, rel), text);
    console.log(`${rel}: ${version}`);
  }
  if (lockfiles) {
    exec("npm", ["install", "--package-lock-only", "--ignore-scripts"]);
    exec("cargo", ["update", "-p", "kidock", "--offline", "--manifest-path", join("src-tauri", "Cargo.toml")]);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

function exec(cmd, cmdArgs) {
  // npm is a .cmd shim on Windows, which spawnSync runs only through a shell.
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} failed`);
}
