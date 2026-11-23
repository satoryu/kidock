import MarkdownIt from "markdown-it";
import { DARK_THEME, LIGHT_THEME, getHighlighter, resolveLang } from "./highlighter";
import { sanitizeHtml } from "./sanitize";
import { taskLists } from "./taskLists";

/**
 * Renders untrusted Markdown to sanitized HTML:
 * markdown-it (GFM: tables, strikethrough, linkify, task lists) → Shiki → DOMPurify.
 */
export async function renderMarkdown(src: string): Promise<string> {
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
  }).use(taskLists);
  return sanitizeHtml(md.render(src));
}
