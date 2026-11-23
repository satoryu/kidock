import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export const LIGHT_THEME = "github-light";
export const DARK_THEME = "github-dark";

/** Language aliases accepted in fences, mapped to loaded grammar names. */
const ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  rs: "rust",
  py: "python",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
  md: "markdown",
  golang: "go",
  htm: "html",
  jsonc: "json",
};

let highlighter: Promise<HighlighterCore> | undefined;

/**
 * Lazily creates a single Shiki highlighter with a curated set of grammars.
 * Uses the JavaScript regex engine (no WebAssembly) so the CSP needs no
 * `'wasm-unsafe-eval'`.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
    langs: [
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/tsx.mjs"),
      import("shiki/langs/javascript.mjs"),
      import("shiki/langs/jsx.mjs"),
      import("shiki/langs/json.mjs"),
      import("shiki/langs/rust.mjs"),
      import("shiki/langs/python.mjs"),
      import("shiki/langs/go.mjs"),
      import("shiki/langs/java.mjs"),
      import("shiki/langs/bash.mjs"),
      import("shiki/langs/powershell.mjs"),
      import("shiki/langs/yaml.mjs"),
      import("shiki/langs/toml.mjs"),
      import("shiki/langs/html.mjs"),
      import("shiki/langs/css.mjs"),
      import("shiki/langs/sql.mjs"),
      import("shiki/langs/diff.mjs"),
      import("shiki/langs/markdown.mjs"),
    ],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

/** Returns the loaded grammar name for a fence info string, or `undefined`. */
export function resolveLang(hl: HighlighterCore, info: string): string | undefined {
  const name = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!name) return undefined;
  const resolved = ALIASES[name] ?? name;
  return hl.getLoadedLanguages().includes(resolved) ? resolved : undefined;
}
