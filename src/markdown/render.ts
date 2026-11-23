import MarkdownIt from "markdown-it";
import { DARK_THEME, LIGHT_THEME, getHighlighter, resolveLang } from "./highlighter";
import type { StateCore } from "markdown-it";
import { slugify } from "./paths";
import { type DocContext, sanitizeHtml } from "./sanitize";
import { taskLists } from "./taskLists";

/** Prefix for heading ids, so a heading can never clobber a DOM global (as on GitHub). */
export const HEADING_ID_PREFIX = "user-content-";

/** Adds GitHub-style ids to headings (`## Next steps` → `user-content-next-steps`). */
function headingIds(md: InstanceType<typeof MarkdownIt>) {
  md.core.ruler.push("heading_ids", (state: StateCore) => {
    const seen = new Map<string, number>();
    state.tokens.forEach((token, i) => {
      if (token.type !== "heading_open") return;
      const base = slugify(state.tokens[i + 1]?.content ?? "");
      if (!base) return;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      token.attrSet("id", HEADING_ID_PREFIX + (n === 0 ? base : `${base}-${n}`));
    });
  });
}

/**
 * Renders untrusted Markdown to sanitized HTML:
 * markdown-it (GFM: tables, strikethrough, linkify, task lists, heading ids)
 * → Shiki → DOMPurify (+ relative image/link handling when `doc` is given).
 */
export async function renderMarkdown(src: string, doc?: DocContext): Promise<string> {
  const hl = await getHighlighter();
  const md = new MarkdownIt({
    html: true, // allowed, then sanitized below
    linkify: true,
    highlight(code, info) {
      const lang = resolveLang(hl, info);
      if (!lang) return ""; // markdown-it falls back to escaped <pre><code>
      return hl.codeToHtml(code, {
        lang,
        themes: { light: LIGHT_THEME, dark: DARK_THEME },
      });
    },
  })
    .use(taskLists)
    .use(headingIds);
  return sanitizeHtml(md.render(src), doc);
}
