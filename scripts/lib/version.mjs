// Version helpers for the release workflow (#23): the tag guard
// (scripts/release-check.mjs) and the bump helper (scripts/set-version.mjs).
// Pure functions over file contents; the scripts do the I/O.

// SemVer 2.0 core with an optional pre-release. Build metadata (`+…`) is
// rejected: the Windows bundlers would silently fold it into the file version.
const IDENT = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const VERSION_RE = new RegExp(`^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(${IDENT}(?:\\.${IDENT})*))?$`);

/** The files that carry the app version, keyed by their repo-relative path. */
export const VERSION_FILES = {
  packageJson: "package.json",
  cargoToml: "src-tauri/Cargo.toml",
  tauriConf: "src-tauri/tauri.conf.json",
};

/**
 * @param {string} input e.g. "0.2.0" or "0.1.1-rc.1"
 * @returns {{ version: string, prerelease: boolean }}
 */
export function parseVersion(input) {
  const m = VERSION_RE.exec(input);
  if (!m) throw new Error(`invalid version ${JSON.stringify(input)}: expected MAJOR.MINOR.PATCH[-PRERELEASE]`);
  return { version: input, prerelease: m[4] !== undefined };
}

/**
 * @param {string} tag e.g. "v0.2.0" or "refs/tags/v0.2.0"
 * @returns {{ version: string, prerelease: boolean }}
 */
export function parseTag(tag) {
  const name = tag.startsWith("refs/tags/") ? tag.slice("refs/tags/".length) : tag;
  if (!/^v\d/.test(name)) throw new Error(`invalid tag ${JSON.stringify(tag)}: expected vMAJOR.MINOR.PATCH[-PRERELEASE]`);
  try {
    return parseVersion(name.slice(1));
  } catch {
    throw new Error(`invalid tag ${JSON.stringify(tag)}: expected vMAJOR.MINOR.PATCH[-PRERELEASE]`);
  }
}

/**
 * @param {{ packageJson: string, cargoToml: string, tauriConf: string }} files contents
 * @returns {Record<string, string | null>} version per repo-relative path
 */
export function readVersions({ packageJson, cargoToml, tauriConf }) {
  const json = (text) => {
    const v = JSON.parse(text).version;
    return typeof v === "string" ? v : null;
  };
  const cargo = packageSectionVersion(cargoToml);
  return {
    [VERSION_FILES.packageJson]: json(packageJson),
    [VERSION_FILES.cargoToml]: cargo ? cargo.value : null,
    [VERSION_FILES.tauriConf]: json(tauriConf),
  };
}

/**
 * @param {string} expected the tag's version
 * @param {Record<string, string | null>} versions from readVersions
 * @returns {string[]} one message per mismatching file (empty when all match)
 */
export function checkVersions(expected, versions) {
  return Object.entries(versions)
    .filter(([, v]) => v !== expected)
    .map(([file, v]) => (v === null ? `${file} has no version` : `${file} has version ${v}`) + `, expected ${expected}`);
}

/** Replaces the top-level `"version"` string of a JSON document, keeping all other text. */
export function setJsonVersion(text, version) {
  JSON.parse(text); // the scanner below assumes well-formed JSON
  const span = topLevelVersionSpan(text);
  if (!span) throw new Error("no top-level version field");
  return text.slice(0, span.start) + JSON.stringify(version) + text.slice(span.end);
}

/** Replaces `version` in the `[package]` table of a Cargo.toml, keeping all other text. */
export function setCargoTomlVersion(text, version) {
  const found = packageSectionVersion(text);
  if (!found) throw new Error("no version in [package]");
  return text.slice(0, found.start) + JSON.stringify(version) + text.slice(found.end);
}

/** Finds `version = "…"` in `[package]`; returns the value and the span of its quoted string. */
function packageSectionVersion(text) {
  let inPackage = false;
  let offset = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) inPackage = trimmed.replace(/\s+#.*$/, "") === "[package]";
    else if (inPackage) {
      const m = /^(\s*version\s*=\s*)("([^"\\]*)")/.exec(line);
      if (m) {
        const start = offset + m[1].length;
        return { value: m[3], start, end: start + m[2].length };
      }
    }
    offset += line.length + 1;
  }
  return null;
}

/** Span of the string value of the top-level "version" key, found by scanning the JSON text. */
function topLevelVersionSpan(text) {
  let depth = 0;
  let i = 0;
  const readString = () => {
    const start = i;
    i++; // opening quote
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++; // closing quote
    return { start, end: i, value: JSON.parse(text.slice(start, i)) };
  };
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const key = readString();
      if (depth !== 1 || key.value !== "version") continue;
      let j = i;
      while (/\s/.test(text[j])) j++;
      if (text[j] !== ":") continue; // a value, not a key
      j++;
      while (/\s/.test(text[j])) j++;
      if (text[j] !== '"') return null;
      i = j;
      const value = readString();
      return { start: value.start, end: value.end };
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    i++;
  }
  return null;
}
