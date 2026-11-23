/**
 * Resolves a link or image target written in the Markdown file `fromFile`
 * (a `/`-separated path relative to the project folder) to a path relative to
 * the project folder. A leading `/` means the project root. Query strings and
 * fragments are dropped. Returns `null` if the result escapes the project,
 * is empty, or names a directory.
 */
export function resolveRelative(fromFile: string, target: string): string | null {
  const path = target.split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (decoded === "" || decoded.endsWith("/")) return null;

  const base = decoded.startsWith("/") ? [] : fromFile.split("/").slice(0, -1);
  const parts = [...base];
  for (const seg of decoded.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.length > 0 ? parts.join("/") : null;
}

/** GitHub-style heading slug: lowercase, punctuation dropped, spaces → `-`. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}
