import DOMPurify from "dompurify";

/**
 * Renders the `<pre class="mermaid-src">` placeholders that `renderMarkdown`
 * emits for ```mermaid fences, after the document is in the DOM.
 *
 * Security (CLAUDE.md: Mermaid labels are untrusted): `securityLevel: "strict"`
 * and SVG text labels (`htmlLabels: false`); the resulting SVG is sanitized
 * again with DOMPurify's SVG profile before insertion.
 */

type Options = {
  dark: boolean;
  /** False once a newer load of the document started; rendering then stops. */
  isCurrent: () => boolean;
};

/**
 * Removes Mermaid configuration from untrusted diagram source: `%%{…}%%`
 * directives (e.g. `%%{init: …}%%`) and a leading `---` front-matter block.
 * Config merging is where Mermaid prototype-pollution bugs have lived, and
 * Kidock runs without `freezePrototype` (see docs/features/10-mermaid/design.md).
 */
export function stripConfig(source: string): string {
  return source
    .replace(/^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "")
    .replace(/%%\{[\s\S]*?\}%%/g, "");
}

const svgPurifier = DOMPurify(window);
let counter = 0;
let initializedTheme: string | null = null;
/** Mermaid is not re-entrant: renders are serialized through this chain. */
let queue: Promise<unknown> = Promise.resolve();

export async function renderDiagrams(root: HTMLElement, { dark, isCurrent }: Options): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>("pre.mermaid-src")];
  if (blocks.length === 0) return;

  const run = async () => {
    // Loaded on demand: documents without diagrams never fetch Mermaid.
    let mermaid: typeof import("mermaid").default;
    try {
      mermaid = (await import("mermaid")).default;
    } catch (e) {
      if (!isCurrent()) return;
      for (const block of blocks) block.replaceWith(errorFigure(e, block.textContent ?? ""));
      return;
    }
    const theme = dark ? "dark" : "default";
    if (initializedTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: false,
        theme,
        suppressErrorRendering: true,
      });
      initializedTheme = theme;
    }
    for (const block of blocks) {
      if (!isCurrent()) return;
      const source = block.textContent ?? "";
      let figure: HTMLElement;
      try {
        const { svg } = await mermaid.render(`kidock-mermaid-${++counter}`, stripConfig(source));
        figure = document.createElement("figure");
        figure.className = "mermaid";
        figure.innerHTML = svgPurifier.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ["style"], // Mermaid's look lives in an embedded <style>
          FORBID_TAGS: ["foreignObject", "script"],
        });
      } catch (e) {
        figure = errorFigure(e, source);
      }
      if (!isCurrent()) return;
      block.replaceWith(figure);
    }
  };

  const done = queue.then(run, run);
  queue = done.catch(() => {});
  await done;
}

function errorFigure(error: unknown, source: string): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "mermaid-error";
  figure.setAttribute("role", "note");
  const caption = document.createElement("figcaption");
  caption.textContent = `Mermaid diagram error: ${error instanceof Error ? error.message : String(error)}`;
  const pre = document.createElement("pre");
  pre.textContent = source;
  figure.append(caption, pre);
  return figure;
}
