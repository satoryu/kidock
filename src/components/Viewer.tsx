import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useApi } from "../api/context";
import { renderMarkdown } from "../markdown/render";
import { messageFor } from "./errors";

export type OpenFile = { projectId: number; relPath: string };

type ViewerProps = {
  file: OpenFile | null;
  /** Bump to reload the same file in place (it changed on disk). */
  version?: number;
  /** Shown when no file is open. */
  placeholder: string;
};

type ViewState =
  | { status: "idle" }
  | { status: "loading"; html?: string }
  | { status: "ok"; html: string }
  | { status: "error"; error: unknown };

export function Viewer({ file, version = 0, placeholder }: ViewerProps) {
  const api = useApi();
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const rootRef = useRef<HTMLDivElement>(null);
  /** Scroll offset to apply once the next document is in the DOM. */
  const restoreTo = useRef<number | null>(null);
  const shownKey = useRef<string | null>(null);

  const projectId = file?.projectId;
  const relPath = file?.relPath;

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
      .then(renderMarkdown)
      .then(
        (html) => {
          if (cancelled) return;
          // Same file reloaded: keep the reading position. Another file: start at the top.
          restoreTo.current = shownKey.current === key ? (scroller()?.scrollTop ?? 0) : 0;
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
  }, [api, projectId, relPath, version]);

  useLayoutEffect(() => {
    const el = scroller();
    if (view.status === "ok" && el && restoreTo.current !== null) {
      el.scrollTop = restoreTo.current;
      restoreTo.current = null;
    }
  }, [view]);

  // Never let the WebView navigate away. In-app .md links and external links come in #11.
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest("a")) e.preventDefault();
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
