import type { MarkdownIt, StateCore } from "markdown-it";

const TASK_RE = /^\[([ xX])\][  ]/;

/**
 * Minimal GFM task list support: `- [ ] item` / `- [x] item` become list items
 * with a disabled checkbox. (Existing plugins on npm are unmaintained.)
 */
export const taskLists = (md: MarkdownIt): void => {
  md.core.ruler.after("inline", "task_lists", (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (
        inline.type !== "inline" ||
        tokens[i - 1].type !== "paragraph_open" ||
        tokens[i - 2].type !== "list_item_open"
      ) {
        continue;
      }
      const match = TASK_RE.exec(inline.content);
      const first = inline.children?.[0];
      if (!match || !first || first.type !== "text" || !TASK_RE.test(first.content)) continue;

      const checked = match[1] !== " ";
      first.content = first.content.replace(TASK_RE, "");
      const box = new state.Token("html_inline", "", 0);
      box.content = `<input type="checkbox" disabled${checked ? " checked" : ""}> `;
      inline.children!.unshift(box);
      tokens[i - 2].attrJoin("class", "task-list-item");
    }
  });
};
