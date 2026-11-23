// Detects shell commands that stage files in bulk (`git add -A`, `git add .`, ...).
// Used by the Claude Code PreToolUse hook in `.claude/hooks/guard-git-add.mjs`.
//
// This is a guardrail against habits, not a sandbox: it understands quoting,
// command chains, `$(...)`, backticks, and heredocs, but not `eval`, aliases,
// or `sh -c`.

const REASON =
  "Bulk staging is not allowed in this repository (CLAUDE.md). " +
  "Stage explicit paths instead, e.g. `git add src/a.ts docs/b.md`.";

/** `git add` options that stage everything (or every tracked file). */
const BULK_LONG_OPTIONS = new Set(["--all", "--update", "--no-ignore-removal"]);
/** Short flags with the same effect; they may appear combined (`-Av`). */
const BULK_SHORT_FLAGS = ["A", "u"];
/** Pathspecs that mean "everything" instead of naming files. */
const BULK_PATHSPECS = new Set([".", "./", "./*", ":", ":/", ":/*", "*"]);

/** Git global options that take a separate value (`-C <dir>`). */
const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
]);

/**
 * Returns a human-readable reason if `command` contains a bulk `git add`,
 * otherwise `null`.
 * @param {string} command
 * @returns {string | null}
 */
export function findBulkGitAdd(command) {
  const pending = [command];
  while (pending.length > 0) {
    const source = /** @type {string} */ (pending.pop());
    const { commands, substitutions } = parse(source);
    pending.push(...substitutions);
    if (commands.some(isBulkGitAdd)) return REASON;
  }
  return null;
}

/** @param {string[]} words */
function isBulkGitAdd(words) {
  let i = 0;
  // Leading environment assignments: `GIT_TRACE=1 git add .`
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  if (!isGitProgram(words[i])) return false;
  i++;

  // Git global options before the subcommand.
  while (i < words.length && words[i].startsWith("-")) {
    const opt = words[i];
    i += GIT_OPTIONS_WITH_VALUE.has(opt) ? 2 : 1;
  }
  if (words[i] !== "add") return false;

  let afterDoubleDash = false;
  for (const arg of words.slice(i + 1)) {
    if (!afterDoubleDash) {
      if (arg === "--") {
        afterDoubleDash = true;
        continue;
      }
      if (arg.startsWith("--")) {
        if (BULK_LONG_OPTIONS.has(arg.split("=")[0])) return true;
        continue;
      }
      if (arg.startsWith("-") && arg.length > 1) {
        if (BULK_SHORT_FLAGS.some((f) => arg.slice(1).includes(f))) return true;
        continue;
      }
    }
    if (BULK_PATHSPECS.has(arg)) return true;
  }
  return false;
}

/** @param {string | undefined} word */
function isGitProgram(word) {
  if (!word) return false;
  const base = word.split(/[\\/]/).pop()?.toLowerCase();
  return base === "git" || base === "git.exe";
}

/**
 * Splits shell source into simple commands (arrays of words, quotes removed)
 * and collects the bodies of `$(...)` / backtick substitutions for separate
 * analysis.
 * @param {string} src
 * @returns {{ commands: string[][], substitutions: string[] }}
 */
function parse(src) {
  /** @type {string[][]} */
  const commands = [];
  /** @type {string[]} */
  const substitutions = [];
  /** @type {string[]} */
  let words = [];
  let word = "";
  let inWord = false;
  let i = 0;

  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  /** Reads `$(...)` starting at `src[start] === "$"`; returns the index after `)`. */
  const readDollarParen = (start) => {
    let depth = 1;
    let j = start + 2;
    while (j < src.length && depth > 0) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") depth--;
      j++;
    }
    substitutions.push(src.slice(start + 2, depth === 0 ? j - 1 : j));
    return j;
  };
  /** Heredocs whose bodies start after the next newline. */
  /** @type {Array<{ delim: string, quoted: boolean, stripTabs: boolean }>} */
  let heredocs = [];
  /**
   * Skips the bodies of pending heredocs starting at `start` (just after a
   * newline). Bodies are data, not commands; only an unquoted heredoc expands
   * `$(...)` and backticks, so those are collected for analysis.
   */
  const readHeredocBodies = (start) => {
    let j = start;
    for (const { delim, quoted, stripTabs } of heredocs) {
      const bodyStart = j;
      let bodyEnd = src.length;
      while (j < src.length) {
        const nl = src.indexOf("\n", j);
        const lineEnd = nl === -1 ? src.length : nl;
        let line = src.slice(j, lineEnd);
        if (stripTabs) line = line.replace(/^\t+/, "");
        const next = nl === -1 ? src.length : nl + 1;
        if (line === delim) {
          bodyEnd = j;
          j = next;
          break;
        }
        j = next;
      }
      if (!quoted) substitutions.push(...collectSubstitutions(src.slice(bodyStart, bodyEnd)));
    }
    heredocs = [];
    return j;
  };
  /** Reads `<<[-] WORD` starting at `src[start] === "<"`; returns the index after WORD. */
  const readHeredocStart = (start) => {
    let j = start + 2;
    const stripTabs = src[j] === "-";
    if (stripTabs) j++;
    while (src[j] === " " || src[j] === "\t") j++;
    let delim = "";
    let quoted = false;
    while (j < src.length && !/[\s;&|<>()]/.test(src[j])) {
      const q = src[j];
      if (q === "'" || q === '"') {
        const end = src.indexOf(q, j + 1);
        const stop = end === -1 ? src.length : end;
        delim += src.slice(j + 1, stop);
        quoted = true;
        j = stop + 1;
      } else if (q === "\\") {
        delim += src[j + 1] ?? "";
        quoted = true;
        j += 2;
      } else {
        delim += src[j++];
      }
    }
    if (delim) heredocs.push({ delim, quoted, stripTabs });
    return j;
  };
  /** Reads a backtick substitution starting at `src[start] === "`"`. */
  const readBacktick = (start) => {
    const end = src.indexOf("`", start + 1);
    const stop = end === -1 ? src.length : end;
    substitutions.push(src.slice(start + 1, stop));
    return stop + 1;
  };

  while (i < src.length) {
    const c = src[i];

    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      const stop = end === -1 ? src.length : end;
      word += src.slice(i + 1, stop);
      inWord = true;
      i = stop + 1;
      continue;
    }

    if (c === '"') {
      inWord = true;
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) {
          word += src[i + 1];
          i += 2;
        } else if (src[i] === "$" && src[i + 1] === "(") {
          i = readDollarParen(i);
        } else if (src[i] === "`") {
          i = readBacktick(i);
        } else {
          word += src[i++];
        }
      }
      i++; // closing quote
      continue;
    }

    if (c === "\\" && i + 1 < src.length) {
      if (src[i + 1] !== "\n") {
        word += src[i + 1];
        inWord = true;
      }
      i += 2;
      continue;
    }

    if (c === "$" && src[i + 1] === "(") {
      i = readDollarParen(i);
      inWord = true;
      continue;
    }

    if (c === "`") {
      i = readBacktick(i);
      inWord = true;
      continue;
    }

    if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
      endWord();
      i = readHeredocStart(i);
      continue;
    }

    if (c === "\n") {
      endCommand();
      i = heredocs.length > 0 ? readHeredocBodies(i + 1) : i + 1;
      continue;
    }

    if (c === ";" || c === "&" || c === "|" || c === "(" || c === ")") {
      endCommand();
      i++;
      continue;
    }

    if (c === " " || c === "\t" || c === "\r") {
      endWord();
      i++;
      continue;
    }

    word += c;
    inWord = true;
    i++;
  }
  endCommand();
  return { commands, substitutions };
}

/**
 * Collects `$(...)` and backtick bodies from heredoc text (which is data,
 * except for these expansions).
 * @param {string} text
 * @returns {string[]}
 */
function collectSubstitutions(text) {
  /** @type {string[]} */
  const found = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
    } else if (text[i] === "$" && text[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === "(") depth++;
        else if (text[j] === ")") depth--;
        j++;
      }
      found.push(text.slice(i + 2, depth === 0 ? j - 1 : j));
      i = j;
    } else if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      const stop = end === -1 ? text.length : end;
      found.push(text.slice(i + 1, stop));
      i = stop + 1;
    } else {
      i++;
    }
  }
  return found;
}
