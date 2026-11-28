import { describe, expect, it } from "vitest";
import {
  checkVersions,
  parseTag,
  parseVersion,
  readVersions,
  setCargoTomlVersion,
  setJsonVersion,
} from "./version.mjs";

const PKG = '{\n  "name": "kidock",\n  "private": true,\n  "version": "0.1.0",\n  "dependencies": {\n    "x": "1.0.0"\n  }\n}\n';
const CARGO = [
  "[package]",
  'name = "kidock"',
  'version = "0.1.0"',
  'description = "d"',
  "",
  "[dependencies]",
  'serde = { version = "1", features = ["derive"] }',
  'version = "9.9.9"',
  "",
].join("\n");
const CONF = '{\n  "productName": "Kidock",\n  "version": "0.1.0",\n  "bundle": { "windows": { "wix": { "version": "1.0.0" } } }\n}\n';

describe("parseVersion", () => {
  it.each([
    ["0.2.0", { version: "0.2.0", prerelease: false }],
    ["1.10.3", { version: "1.10.3", prerelease: false }],
    ["0.1.1-rc.1", { version: "0.1.1-rc.1", prerelease: true }],
    ["2.0.0-beta-2.x", { version: "2.0.0-beta-2.x", prerelease: true }],
  ])("accepts %s", (input, expected) => {
    expect(parseVersion(input)).toEqual(expected);
  });

  it.each(["", "1.2", "1.2.3.4", "01.2.3", "1.2.3-", "1.2.3+build", "1.2.3-rc..1", "1.2.3-01", " 1.2.3"])(
    "rejects %j",
    (input) => {
      expect(() => parseVersion(input)).toThrow(/version/);
    },
  );
});

describe("parseTag", () => {
  it("strips the leading v", () => {
    expect(parseTag("v0.2.0")).toEqual({ version: "0.2.0", prerelease: false });
    expect(parseTag("v0.1.1-rc.1")).toEqual({ version: "0.1.1-rc.1", prerelease: true });
  });

  it("accepts a full ref", () => {
    expect(parseTag("refs/tags/v1.0.0").version).toBe("1.0.0");
  });

  it.each(["0.2.0", "version-0.2.0", "v0.2", "vv0.2.0", "refs/heads/v0.2.0"])("rejects %j", (tag) => {
    expect(() => parseTag(tag)).toThrow(/tag/);
  });
});

describe("readVersions", () => {
  it("reads the top-level / [package] version of each file", () => {
    expect(readVersions({ packageJson: PKG, cargoToml: CARGO, tauriConf: CONF })).toEqual({
      "package.json": "0.1.0",
      "src-tauri/Cargo.toml": "0.1.0",
      "src-tauri/tauri.conf.json": "0.1.0",
    });
  });

  it("reports a missing version as null", () => {
    const v = readVersions({ packageJson: "{}", cargoToml: "[package]\nname = \"k\"\n", tauriConf: "{}" });
    expect(Object.values(v)).toEqual([null, null, null]);
  });
});

describe("checkVersions", () => {
  const all = (v) => ({ "package.json": v, "src-tauri/Cargo.toml": v, "src-tauri/tauri.conf.json": v });

  it("passes when every file matches the tag", () => {
    expect(checkVersions("0.2.0", all("0.2.0"))).toEqual([]);
  });

  it("lists each file that differs", () => {
    const v = { ...all("0.2.0"), "src-tauri/Cargo.toml": "0.1.0", "src-tauri/tauri.conf.json": null };
    expect(checkVersions("0.2.0", v)).toEqual([
      "src-tauri/Cargo.toml has version 0.1.0, expected 0.2.0",
      "src-tauri/tauri.conf.json has no version, expected 0.2.0",
    ]);
  });
});

describe("setJsonVersion", () => {
  it("changes only the top-level version and keeps formatting", () => {
    const out = setJsonVersion(PKG, "0.2.0");
    expect(out).toBe(PKG.replace('"version": "0.1.0"', '"version": "0.2.0"'));
    const conf = setJsonVersion(CONF, "0.2.0");
    expect(JSON.parse(conf).version).toBe("0.2.0");
    expect(JSON.parse(conf).bundle.windows.wix.version).toBe("1.0.0");
  });

  it("rejects malformed JSON instead of scanning it", () => {
    expect(() => setJsonVersion('{ "version": "0.1.0', "0.2.0")).toThrow();
  });

  it("throws when there is no top-level version", () => {
    expect(() => setJsonVersion('{ "a": { "version": "1.0.0" } }', "0.2.0")).toThrow(/version/);
  });
});

describe("setCargoTomlVersion", () => {
  it("changes only version in [package]", () => {
    const out = setCargoTomlVersion(CARGO, "0.2.0");
    expect(out).toBe(CARGO.replace('version = "0.1.0"', 'version = "0.2.0"'));
    expect(out).toContain('version = "9.9.9"');
  });

  it("keeps CRLF line endings", () => {
    const crlf = CARGO.replace(/\n/g, "\r\n");
    expect(setCargoTomlVersion(crlf, "0.2.0")).toBe(crlf.replace('version = "0.1.0"', 'version = "0.2.0"'));
  });

  it("throws when [package] has no version", () => {
    expect(() => setCargoTomlVersion('[package]\nname = "k"\n[dependencies]\nversion = "1"\n', "0.2.0")).toThrow(
      /version/,
    );
  });
});
