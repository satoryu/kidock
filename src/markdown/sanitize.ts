import DOMPurify from "dompurify";

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

/** Sanitizes rendered Markdown HTML. The result is the only HTML the Viewer injects. */
export function sanitizeHtml(html: string): string {
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
