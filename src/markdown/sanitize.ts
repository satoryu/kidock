import DOMPurify from "dompurify";
import { resolveRelative } from "./paths";

/** Where the document lives, so relative images and links can be resolved. */
export type DocContext = {
  projectId: number;
  /** The Markdown file's path relative to the project folder. */
  relPath: string;
  /** URL that serves a project file (the `kidock-asset` scheme in the app). */
  assetUrl: (projectId: number, relPath: string) => string;
};

/** Set only for the duration of one synchronous `sanitizeHtml` call. */
let current: DocContext | null = null;

/** Style properties Shiki emits on highlighted code; everything else is dropped. */
const ALLOWED_STYLE_PROP =
  /^(?:color|background-color|font-style|font-weight|text-decoration|--shiki-[a-z-]+)$/i;

/** http(s), mailto, in-page anchors, and scheme-less (relative) URLs only. */
const ALLOWED_URI = /^(?:https?:|mailto:|#|(?![a-z][a-z0-9+.-]*:))/i;

const purifier = DOMPurify(window);

purifier.addHook("uponSanitizeElement", (node, data) => {
  // Only the disabled task-list checkbox survives as an <input>.
  if (data.tagName === "input") {
    const el = node as Element;
    if (el.getAttribute("type") !== "checkbox") {
      el.remove();
    } else {
      el.setAttribute("disabled", "");
    }
  }
});

purifier.addHook("uponSanitizeAttribute", (node, data) => {
  if (data.attrName !== "style") return;
  // Styles are only meaningful inside Shiki output; elsewhere drop them.
  if (!(node as Element).closest?.("pre.shiki")) {
    data.keepAttr = false;
    return;
  }
  data.attrValue = data.attrValue
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => {
      const prop = decl.split(":")[0]?.trim() ?? "";
      return decl.includes(":") && ALLOWED_STYLE_PROP.test(prop) && !/url\(|expression\(/i.test(decl);
    })
    .join(";");
});

// Runs after DOMPurify validated the attributes, so only safe URLs remain.
purifier.addHook("afterSanitizeAttributes", (node) => {
  const el = node as Element;
  if (el.tagName === "IMG") rewriteImage(el);
  else if (el.tagName === "A") classifyLink(el);
});

function rewriteImage(img: Element) {
  const src = img.getAttribute("src");
  if (!src || /^data:/i.test(src)) return;
  const block = () => {
    img.removeAttribute("src");
    img.setAttribute("data-blocked-src", src);
    img.classList.add("blocked-image");
  };
  // Remote images could track the reader: never load them.
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return block();
  if (!current) return;
  const resolved = resolveRelative(current.relPath, src);
  if (resolved === null) return block();
  img.setAttribute("src", current.assetUrl(current.projectId, resolved));
}

function classifyLink(a: Element) {
  const href = a.getAttribute("href");
  if (!href) return;
  if (href.startsWith("#")) {
    a.setAttribute("data-anchor", href.slice(1));
    return;
  }
  if (/^(?:https?:|mailto:)/i.test(href)) {
    a.setAttribute("data-external", "");
    return;
  }
  if (!current) return;
  const hash = href.indexOf("#");
  const anchor = hash >= 0 ? href.slice(hash + 1) : "";
  const resolved = resolveRelative(current.relPath, href);
  const path = href.split(/[?#]/, 1)[0];
  if (resolved !== null && /\.md$/i.test(path)) {
    a.setAttribute("data-md-link", resolved);
    if (anchor) a.setAttribute("data-anchor", anchor);
  } else {
    // Other local files are not opened (yet); show where the link points.
    a.setAttribute("data-local-link", resolved ?? href);
    a.setAttribute("title", href);
  }
}

/**
 * Sanitizes rendered Markdown HTML. The result is the only HTML the Viewer
 * injects. With `doc`, relative images are served from the project and
 * links are classified for the Viewer's click handling.
 */
export function sanitizeHtml(html: string, doc?: DocContext): string {
  current = doc ?? null;
  try {
    return sanitize(html);
  } finally {
    current = null;
  }
}

function sanitize(html: string): string {
  return purifier.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "iframe",
      "frame",
      "object",
      "embed",
      "form",
      "button",
      "textarea",
      "select",
      "link",
      "meta",
      "base",
    ],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
  });
}
