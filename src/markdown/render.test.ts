import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render";

/** Parses rendered HTML for structural assertions. */
function dom(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

async function render(src: string): Promise<HTMLElement> {
  const el = document.createElement("div");
  el.innerHTML = await renderMarkdown(src);
  return el;
}

describe("renderMarkdown: GFM", () => {
  it("renders headings and paragraphs", async () => {
    const el = await render("# Title\n\nHello **world**");
    expect(el.querySelector("h1")?.textContent).toBe("Title");
    expect(el.querySelector("strong")?.textContent).toBe("world");
  });

  it("renders tables", async () => {
    const el = await render("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(el.querySelectorAll("table th")).toHaveLength(2);
    expect(el.querySelector("table td")?.textContent).toBe("1");
  });

  it("renders strikethrough", async () => {
    const el = await render("~~gone~~");
    expect(el.querySelector("s")?.textContent).toBe("gone");
  });

  it("autolinks bare URLs", async () => {
    const el = await render("see https://example.com now");
    expect(el.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });

  it("renders task lists as disabled checkboxes", async () => {
    const el = await render("- [ ] todo\n- [x] done\n- plain");
    const items = el.querySelectorAll("li");
    const boxes = el.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    boxes.forEach((b) => expect(b.disabled).toBe(true));
    expect(items[0].classList.contains("task-list-item")).toBe(true);
    expect(items[0].textContent?.trim()).toBe("todo");
    expect(items[2].classList.contains("task-list-item")).toBe(false);
  });

  it("does not treat [x] in the middle of text as a task", async () => {
    const el = await render("- see [x] here");
    expect(el.querySelector("input")).toBeNull();
  });
});

describe("renderMarkdown: code highlighting", () => {
  it("highlights known languages with Shiki (light + dark variables)", async () => {
    const el = await render("```ts\nconst x: number = 1;\n```");
    const pre = el.querySelector("pre.shiki");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain("const x: number = 1;");
    const span = pre?.querySelector("span[style]");
    expect(span?.getAttribute("style")).toMatch(/--shiki-dark/);
  });

  it("resolves common aliases", async () => {
    for (const lang of ["rs", "sh", "py", "yml", "js"]) {
      const el = await render("```" + lang + "\nx\n```");
      expect(el.querySelector("pre.shiki"), lang).not.toBeNull();
    }
  });

  it("falls back to plain escaped code for unknown or missing languages", async () => {
    for (const fence of ["```nosuchlang", "```"]) {
      const el = await render(`${fence}\n<b>x</b>\n\`\`\``);
      expect(el.querySelector("pre.shiki")).toBeNull();
      expect(el.querySelector("pre code")?.textContent).toBe("<b>x</b>\n");
      expect(el.querySelector("b")).toBeNull();
    }
  });
});

describe("renderMarkdown: sanitization", () => {
  it("strips script tags and inline event handlers", async () => {
    const el = await render('<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(1)">');
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("img")?.hasAttribute("onerror")).toBe(false);
  });

  it("neutralizes javascript: and data: links in Markdown and raw HTML", async () => {
    const el = await render(
      '[md](javascript:alert(1))\n\n<a href="javascript:alert(1)">raw</a>\n\n<a href="data:text/html,x">d</a>',
    );
    el.querySelectorAll("a").forEach((a) => {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^(javascript|data):/i);
    });
  });

  it("removes embedding and form elements", async () => {
    const el = await render(
      '<iframe src="https://x"></iframe><object data="x"></object><embed src="x"><form><input type="text"><button>b</button></form><style>body{}</style>',
    );
    for (const sel of ["iframe", "object", "embed", "form", "input", "button", "style"]) {
      expect(el.querySelector(sel), sel).toBeNull();
    }
  });

  it("drops style attributes on user HTML", async () => {
    const el = await render('<div style="position:fixed;inset:0">overlay</div>');
    expect(el.querySelector("div")?.hasAttribute("style")).toBe(false);
  });

  it("drops non-color styles even inside a forged shiki block", async () => {
    const el = await render(
      '<pre class="shiki"><code><span style="position:fixed;color:red">x</span></code></pre>',
    );
    const style = el.querySelector("span")?.getAttribute("style") ?? "";
    expect(style).not.toMatch(/position/);
  });

  it("keeps safe links", async () => {
    const el = await render("[a](https://example.com) [b](mailto:a@b.c) [c](./other.md) [d](#sec)");
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://example.com", "mailto:a@b.c", "./other.md", "#sec"]);
  });
});

describe("renderMarkdown: heading ids", () => {
  it("adds prefixed GitHub-style ids, unique per document", async () => {
    const html = await renderMarkdown("# Next steps\n\n## Next steps\n\n### Hi!");
    const ids = [...dom(html).querySelectorAll("h1, h2, h3")].map((h) => h.id);
    expect(ids).toEqual(["user-content-next-steps", "user-content-next-steps-1", "user-content-hi"]);
  });
});

describe("renderMarkdown: relative images and links", () => {
  const doc = {
    projectId: 7,
    relPath: "docs/report.md",
    assetUrl: (p: number, r: string) => `asset://${p}/${r}`,
  };

  it("serves relative images from the project and blocks escapes and remote images", async () => {
    const html = await renderMarkdown(
      "![a](img/a.png) ![b](../top.png) ![c](../../escape.png) ![d](https://tracker.example/p.gif) ![e](data:image/png;base64,AAAA)",
      doc,
    );
    const imgs = [...dom(html).querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      "asset://7/docs/img/a.png",
      "asset://7/top.png",
      null,
      null,
      "data:image/png;base64,AAAA",
    ]);
    expect(imgs[2].getAttribute("data-blocked-src")).toBe("../../escape.png");
    expect(imgs[3].classList.contains("blocked-image")).toBe(true);
  });

  it("classifies links for the viewer", async () => {
    const html = await renderMarkdown(
      "[a](next.md) [b](../plan.md#steps) [c](#local) [d](https://example.com) [e](mailto:x@y.z) [f](data.csv) [g](../../out.md)",
      doc,
    );
    const links = [...dom(html).querySelectorAll("a")].map((a) => ({
      md: a.getAttribute("data-md-link"),
      anchor: a.getAttribute("data-anchor"),
      external: a.hasAttribute("data-external"),
      local: a.getAttribute("data-local-link"),
    }));
    expect(links).toEqual([
      { md: "docs/next.md", anchor: null, external: false, local: null },
      { md: "plan.md", anchor: "steps", external: false, local: null },
      { md: null, anchor: "local", external: false, local: null },
      { md: null, anchor: null, external: true, local: null },
      { md: null, anchor: null, external: true, local: null },
      { md: null, anchor: null, external: false, local: "docs/data.csv" },
      { md: null, anchor: null, external: false, local: "../../out.md" },
    ]);
  });

  it("still neutralizes javascript: links when a document context is given", async () => {
    const html = await renderMarkdown('[x](javascript:alert(1)) <a href="javascript:alert(2)">y</a>', doc);
    const links = [...dom(html).querySelectorAll("a")];
    expect(links).toHaveLength(1); // markdown-it refuses the first; the raw one survives as text-only
    expect(links[0].getAttribute("href")).toBeNull();
    expect(links[0].attributes).toHaveLength(0);
  });
});
