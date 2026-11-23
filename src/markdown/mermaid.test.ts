import { beforeEach, describe, expect, it, vi } from "vitest";

const render = vi.fn();
const initialize = vi.fn();
vi.mock("mermaid", () => ({ default: { render, initialize } }));

import { renderDiagrams, stripConfig } from "./mermaid";

function article(html: string): HTMLElement {
  const el = document.createElement("article");
  el.innerHTML = html;
  return el;
}

const block = (src: string) => `<pre class="mermaid-src"><code>${src}</code></pre>`;

describe("renderDiagrams", () => {
  beforeEach(() => {
    render.mockReset();
    initialize.mockReset();
  });

  it("does nothing (and loads nothing) without diagrams", async () => {
    await renderDiagrams(article("<p>no diagrams</p>"), { dark: false, isCurrent: () => true });
    expect(initialize).not.toHaveBeenCalled();
  });

  it("replaces each block with a sanitized SVG figure, in order, with a strict config", async () => {
    render.mockImplementation(async (id: string, text: string) => ({
      svg: `<svg id="${id}"><style>.a{fill:red}</style><script>alert(1)</script><g onclick="alert(2)"><text>${text}</text></g><foreignObject><div>x</div></foreignObject></svg>`,
    }));
    const root = article(`${block("graph TD; A-->B")}<p>between</p>${block("sequenceDiagram")}`);
    await renderDiagrams(root, { dark: true, isCurrent: () => true });

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, theme: "dark" }),
    );
    expect(render.mock.calls.map((c) => c[1])).toEqual(["graph TD; A-->B", "sequenceDiagram"]);
    const figures = root.querySelectorAll("figure.mermaid");
    expect(figures).toHaveLength(2);
    expect(root.querySelector("pre.mermaid-src")).toBeNull();
    expect(root.querySelector("script, foreignObject")).toBeNull();
    expect(root.querySelector("[onclick]")).toBeNull();
    expect(root.querySelector("figure.mermaid svg style")).not.toBeNull();
    expect(figures[0].textContent).toContain("graph TD; A-->B");
  });

  it("shows an error box with the message and source for an invalid diagram", async () => {
    render.mockRejectedValueOnce(new Error("Parse error on line 1"));
    const root = article(block("not a diagram &lt;b&gt;"));
    await renderDiagrams(root, { dark: false, isCurrent: () => true });
    const err = root.querySelector("figure.mermaid-error");
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain("Parse error on line 1");
    expect(err?.textContent).toContain("not a diagram <b>");
    expect(err?.querySelector("b")).toBeNull();
  });

  it("stops when a newer load has started", async () => {
    render.mockResolvedValue({ svg: "<svg></svg>" });
    const root = article(block("a") + block("b"));
    let current = true;
    render.mockImplementationOnce(async () => {
      current = false; // a newer load starts while the first diagram renders
      return { svg: "<svg></svg>" };
    });
    await renderDiagrams(root, { dark: false, isCurrent: () => current });
    expect(root.querySelectorAll("figure.mermaid")).toHaveLength(0);
    expect(root.querySelectorAll("pre.mermaid-src")).toHaveLength(2);
  });
});

describe("stripConfig", () => {
  it("removes init directives and front-matter config from untrusted source", () => {
    expect(stripConfig('%%{init: {"__proto__": {"x": 1}}}%%\ngraph TD; A-->B')).toBe("\ngraph TD; A-->B");
    expect(stripConfig("---\nconfig:\n  theme: forest\n---\ngraph TD; A-->B")).toBe("graph TD; A-->B");
    expect(stripConfig("graph TD\n  %%{wrap}%%\n  A-->B")).toBe("graph TD\n  \n  A-->B");
    expect(stripConfig("graph TD; A-->B")).toBe("graph TD; A-->B");
  });

  it("passes stripped source to Mermaid", async () => {
    render.mockResolvedValue({ svg: "<svg></svg>" });
    const root = document.createElement("article");
    root.innerHTML = '<pre class="mermaid-src"><code>%%{init: {"theme": "forest"}}%%graph TD; A--&gt;B</code></pre>';
    await renderDiagrams(root, { dark: false, isCurrent: () => true });
    expect(render.mock.calls[0][1]).toBe("graph TD; A-->B");
  });
});
