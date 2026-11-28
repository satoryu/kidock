import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY_MESSAGE_MS, addCopyButtons, codeText, copyFromButton } from "./codeCopy";
import { renderMarkdown } from "./render";

async function rendered(src: string): Promise<HTMLElement> {
  const el = document.createElement("article");
  el.innerHTML = await renderMarkdown(src);
  return el;
}

const TS = 'const greeting: string = "hi";\nconsole.log(greeting);\n';
const DOC = [
  "```ts",
  TS + "```",
  "",
  "    indented block",
  "",
  "```",
  "plain <b>text</b>",
  "```",
  "",
  "<pre>raw pre</pre>",
  "",
  "```mermaid",
  "graph TD; A-->B",
  "```",
].join("\n");

describe("codeText", () => {
  it("returns the source exactly as written, for highlighted and plain blocks", async () => {
    const root = await rendered(DOC);
    const pres = [...root.querySelectorAll("pre:not(.mermaid-src)")];
    expect(pres.map((p) => codeText(p as HTMLElement))).toEqual([
      TS.slice(0, -1), // one trailing newline dropped
      "indented block",
      "plain <b>text</b>",
      "raw pre",
    ]);
  });
});

describe("addCopyButtons", () => {
  it("adds one labelled button to every code block except Mermaid sources", async () => {
    const root = await rendered(DOC);
    expect(addCopyButtons(root)).toBe(4);
    const blocks = root.querySelectorAll("div.code-block");
    expect(blocks).toHaveLength(4);
    for (const block of blocks) {
      expect(block.firstElementChild?.tagName).toBe("PRE");
      const button = block.querySelector("button.code-copy");
      expect(button?.getAttribute("type")).toBe("button");
      expect(button?.getAttribute("aria-label")).toBe("Copy code");
      expect(button?.querySelector("svg")).not.toBeNull();
      expect(block.querySelector(".code-copy-msg")?.getAttribute("role")).toBe("status");
    }
    expect(root.querySelector("pre.mermaid-src")?.parentElement).toBe(root);
  });

  it("skips Mermaid error boxes and is idempotent", () => {
    const root = document.createElement("article");
    root.innerHTML = '<figure class="mermaid-error"><pre>src</pre></figure><pre><code>x</code></pre>';
    expect(addCopyButtons(root)).toBe(1);
    expect(addCopyButtons(root)).toBe(0);
    expect(root.querySelectorAll("button.code-copy")).toHaveLength(1);
  });

  it("costs nothing without code blocks", () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>text</p>";
    expect(addCopyButtons(root)).toBe(0);
    expect(root.innerHTML).toBe("<p>text</p>");
  });
});

describe("copyFromButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const root = document.createElement("article");
    root.innerHTML = "<pre><code>npm test\n</code></pre>";
    addCopyButtons(root);
    const button = root.querySelector<HTMLButtonElement>("button.code-copy")!;
    const msg = root.querySelector<HTMLElement>(".code-copy-msg")!;
    return { button, msg };
  }

  it("copies the block's text and shows 'Copied' over it for a while", async () => {
    vi.useFakeTimers();
    const { button, msg } = setup();
    const copy = vi.fn().mockResolvedValue(undefined);
    await copyFromButton(button, copy);
    expect(copy).toHaveBeenCalledWith("npm test");
    expect(msg.textContent).toBe("Copied");
    expect(msg.classList.contains("visible")).toBe(true);
    vi.advanceTimersByTime(COPY_MESSAGE_MS);
    expect(msg.classList.contains("visible")).toBe(false);
  });

  it("shows 'Copy failed' when the clipboard write fails", async () => {
    const { button, msg } = setup();
    await copyFromButton(button, () => Promise.reject(new Error("busy")));
    expect(msg.textContent).toBe("Copy failed");
    expect(msg.classList.contains("visible")).toBe(true);
    expect(msg.classList.contains("error")).toBe(true);
  });

  it("restarts the timer when clicked again while the message is shown", async () => {
    vi.useFakeTimers();
    const { button, msg } = setup();
    const copy = () => Promise.resolve();
    await copyFromButton(button, copy);
    vi.advanceTimersByTime(COPY_MESSAGE_MS - 100);
    await copyFromButton(button, copy);
    vi.advanceTimersByTime(COPY_MESSAGE_MS - 100);
    expect(msg.classList.contains("visible")).toBe(true);
    vi.advanceTimersByTime(100);
    expect(msg.classList.contains("visible")).toBe(false);
  });
});
