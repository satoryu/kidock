import { describe, expect, it } from "vitest";
import { resolveRelative, slugify } from "./paths";

describe("resolveRelative", () => {
  it.each([
    ["docs/report.md", "img/a.png", "docs/img/a.png"],
    ["docs/report.md", "./img/a.png", "docs/img/a.png"],
    ["docs/report.md", "../shared/b.png", "shared/b.png"],
    ["docs/deep/r.md", "../../top.md", "top.md"],
    ["report.md", "other.md", "other.md"],
    ["docs/report.md", "/assets/logo.svg", "assets/logo.svg"],
    ["docs/report.md", "a%20b.png", "docs/a b.png"],
    ["docs/report.md", "img/a.png?v=2", "docs/img/a.png"],
    ["docs/report.md", "next.md#section", "docs/next.md"],
    ["docs/report.md", "img//a.png", "docs/img/a.png"],
  ])("resolves %s + %s → %s", (from, target, expected) => {
    expect(resolveRelative(from, target)).toBe(expected);
  });

  it.each([
    ["report.md", "../outside.png"],
    ["docs/report.md", "../../escape.md"],
    ["docs/report.md", "/../escape.md"],
    ["docs/report.md", "%zz.png"],
    ["docs/report.md", ""],
    ["docs/report.md", "docs/"],
  ])("rejects %s + %s", (from, target) => {
    expect(resolveRelative(from, target)).toBeNull();
  });
});

describe("slugify", () => {
  it.each([
    ["Next steps", "next-steps"],
    ["What's new? (v2)", "whats-new-v2"],
    ["  Trim  me ", "trim--me"],
    ["議事録 2026", "議事録-2026"],
    ["snake_case-and-dash", "snake_case-and-dash"],
  ])("%s → %s", (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });
});
