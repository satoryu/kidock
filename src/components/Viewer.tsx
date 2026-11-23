import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useApi } from "../api/context";
import { slugify } from "../markdown/paths";
import { HEADING_ID_PREFIX, renderMarkdown } from "../markdown/render";
import { messageFor } from "./errors";

export type OpenFile = {
  projectId: number;
  relPath: string;
  /** Heading to scroll to once the file is shown (from a `file.md#anchor` link). */
  anchor?: string;
};

type ViewerProps = {
  file: OpenFile | null;
  /** Bump to reload the same file in place (it changed on disk). */
  version?: number;
  /** Shown when no file is open. */
  placeholder: string;
  /** A link to another `.md` file in the same project was clicked. */
  onOpenLink?: (relPath: string, anchor?: string) => void;
};

type ViewState =
  | { status: "idle" }
  | { status: "loading"; html?: string }
  | { status: "ok"; html: string }
  | { status: "error"; error: unknown };

export function Viewer({ file, version = 0, placeholder, onOpenLink }: ViewerProps) {
  const api = useApi();
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const rootRef = useRef<HTMLDivElement>(null);
  /** Scroll offset to apply once the next document is in the DOM. */
  const restoreTo = useRef<number | null>(null);
  const shownKey = useRef<string | null>(null);

  const projectId = file?.projectId;
  const relPath = file?.relPath;
  const anchor = file?.anchor;
  /** Anchor to scroll to once the next document is in the DOM. */
  const pendingAnchor = useRef<string | null>(null);

  // The scrollable pane that holds the viewer (`.pane-main` in the app).
  const scroller = () => rootRef.current?.parentElement ?? null;

  useEffect(() => {
    if (projectId === undefined || relPath === undefined) {
      setView({ status: "idle" });
      shownKey.current = null;
      return;
    }
    const key = `${projectId}\n${relPath}`;
    let cancelled = false; // set when a newer load starts: stale results are dropped
    // Keep showing the previous document while the next one loads (no flash).
    setView((prev) => ({ status: "loading", html: "html" in prev ? prev.html : undefined }));
    api
      .readMarkdown(projectId, relPath)
      .then((text) =>
        renderMarkdown(text, {
          projectId,
          relPath,
          assetUrl: (p, r) => api.assetUrl(p, r),
        }),
      )
      .then(
        (html) => {
          if (cancelled) return;
          // Same file reloaded: keep the reading position. Another file: start at
          // the top, or at the requested anchor.
          const reload = shownKey.current === key;
          restoreTo.current = reload ? (scroller()?.scrollTop ?? 0) : 0;
          pendingAnchor.current = reload ? null : (anchor ?? null);
          shownKey.current = key;
          setView({ status: "ok", html });
        },
        (error: unknown) => {
          if (cancelled) return;
          shownKey.current = null;
          setView({ status: "error", error });
        },
      );
    return () => {
      cancelled = true;
    };
    // `anchor` is read only when a new file opens; it must not trigger a reload.
  }, [api, projectId, relPath, version]);

  useLayoutEffect(() => {
    const el = scroller();
    if (view.status !== "ok" || !el) return;
    if (restoreTo.current !== null) {
      el.scrollTop = restoreTo.current;
      restoreTo.current = null;
    }
    if (pendingAnchor.current !== null) {
      scrollToAnchor(pendingAnchor.current);
      pendingAnchor.current = null;
    }
  }, [view]);

  // A same-file anchor change (e.g. two links into one file) scrolls without reloading.
  useEffect(() => {
    if (anchor && view.status === "ok") scrollToAnchor(anchor);
  }, [anchor]);

  function scrollToAnchor(raw: string) {
    let name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch {
      // keep the raw form
    }
    const root = rootRef.current;
    const target =
      root?.querySelector(`[id="${CSS.escape(HEADING_ID_PREFIX + name)}"]`) ??
      root?.querySelector(`[id="${CSS.escape(HEADING_ID_PREFIX + slugify(name))}"]`);
    target?.scrollIntoView?.({ block: "start" });
  }

  // The WebView never navigates: links are routed by the attributes that
  // `sanitizeHtml` set (see src/markdown/sanitize.ts).
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest("a");
    if (!a) return;
    e.preventDefault();
    const md = a.getAttribute("data-md-link");
    const linkAnchor = a.getAttribute("data-anchor") ?? undefined;
    if (md) {
      onOpenLink?.(md, linkAnchor);
    } else if (linkAnchor !== undefined) {
      scrollToAnchor(linkAnchor);
    } else if (a.hasAttribute("data-external")) {
      const href = a.getAttribute("href");
      if (href) void api.openExternal(href).catch(() => {});
    }
    // Anything else (other local files) stays inert.
  };

  return (
    <div ref={rootRef} className="viewer">
      {body()}
    </div>
  );

  function body() {
    if (!file) return <EmptyState>{placeholder}</EmptyState>;
    if (view.status === "error") {
      return (
        <div className="viewer-message viewer-error" role="alert">
          {messageFor(view.error)}
        </div>
      );
    }
    const html = "html" in view ? view.html : undefined;
    if (html === undefined) return <div className="viewer-message">Loading…</div>;

    return (
      <article
        className="markdown-body"
        onClick={onClick}
        // Safe: `html` comes only from renderMarkdown, which sanitizes with DOMPurify.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
}

function EmptyState({ children }: { children: string }) {
  return <div className="viewer-message">{children}</div>;
}
