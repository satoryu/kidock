/**
 * Copy buttons on rendered code blocks (#21).
 *
 * Runs on the inserted DOM after sanitization, like `mermaid.ts`. The
 * sanitizer still forbids `<button>` and SVG in documents; these elements are
 * built here with DOM APIs, never from HTML strings.
 */

/** How long the "Copied" / "Copy failed" message stays visible. */
export const COPY_MESSAGE_MS = 1500;

const SVG_NS = "http://www.w3.org/2000/svg";
const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** The block's plain text as written in the file, minus one trailing newline. */
export function codeText(pre: HTMLElement): string {
  const code = pre.querySelector(":scope > code") ?? pre;
  return (code.textContent ?? "").replace(/\r?\n$/, "");
}

/**
 * Wraps each code block in `div.code-block` and adds a copy button and a
 * status message. Mermaid sources and error boxes are skipped; blocks that
 * already have a button are left alone. Returns how many buttons were added.
 */
export function addCopyButtons(root: HTMLElement): number {
  let added = 0;
  for (const pre of root.querySelectorAll<HTMLElement>("pre")) {
    if (pre.classList.contains("mermaid-src") || pre.closest("figure.mermaid-error")) continue;
    if (pre.parentElement?.classList.contains("code-block")) continue;

    const block = document.createElement("div");
    block.className = "code-block";
    pre.replaceWith(block);
    block.append(pre, copyButton(), statusMessage());
    added++;
  }
  return added;
}

/** Handles a click on a copy button: copies its block's text and shows the result. */
export async function copyFromButton(button: HTMLElement, copy: (text: string) => Promise<void>): Promise<void> {
  const block = button.closest<HTMLElement>("div.code-block");
  const pre = block?.querySelector<HTMLElement>(":scope > pre");
  const msg = block?.querySelector<HTMLElement>(":scope > .code-copy-msg");
  if (!pre || !msg) return;

  let ok = true;
  try {
    await copy(codeText(pre));
  } catch {
    ok = false;
  }
  msg.textContent = ok ? "Copied" : "Copy failed";
  msg.classList.toggle("error", !ok);
  msg.classList.add("visible");
  clearTimeout(timers.get(msg));
  timers.set(
    msg,
    setTimeout(() => msg.classList.remove("visible"), COPY_MESSAGE_MS),
  );
}

function copyButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-copy";
  button.setAttribute("aria-label", "Copy code");
  button.title = "Copy code";
  button.append(copyIcon());
  return button;
}

function statusMessage(): HTMLDivElement {
  const msg = document.createElement("div");
  msg.className = "code-copy-msg";
  msg.setAttribute("role", "status");
  return msg;
}

/** Two overlapping rounded squares (the usual "copy" glyph). */
function copyIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const rect = (x: string, y: string) => {
    const r = document.createElementNS(SVG_NS, "rect");
    for (const [k, v] of Object.entries({
      x,
      y,
      width: "9",
      height: "9",
      rx: "1.5",
    }))
      r.setAttribute(k, v);
    return r;
  };
  const back = document.createElementNS(SVG_NS, "path");
  back.setAttribute("d", "M2.5 10.5v-7a1 1 0 0 1 1-1h7");
  svg.append(back, rect("5.5", "5.5"));
  return svg;
}
