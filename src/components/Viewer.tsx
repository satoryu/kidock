import { useEffect, useState, type MouseEvent } from "react";
import { useApi } from "../api/context";
import { renderMarkdown } from "../markdown/render";
import { messageFor } from "./errors";

type ViewerProps = {
  hasRoot: boolean;
  relPath: string | null;
};

type ViewState =
  | { status: "idle" }
  | { status: "loading"; html?: string }
  | { status: "ok"; html: string }
  | { status: "error"; error: unknown };

export function Viewer({ hasRoot, relPath }: ViewerProps) {
  const api = useApi();
  const [view, setView] = useState<ViewState>({ status: "idle" });

  useEffect(() => {
    if (!relPath) {
      setView({ status: "idle" });
      return;
    }
    let cancelled = false;
    // Keep showing the previous document while the next one loads (no flash).
    setView((prev) => ({ status: "loading", html: "html" in prev ? prev.html : undefined }));
    api
      .readMarkdown(relPath)
      .then(renderMarkdown)
      .then(
        (html) => !cancelled && setView({ status: "ok", html }),
        (error: unknown) => !cancelled && setView({ status: "error", error }),
      );
    return () => {
      cancelled = true;
    };
  }, [api, relPath]);

  // Never let the WebView navigate away. In-app .md links and external links come in #5.
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest("a")) e.preventDefault();
  };

  if (!hasRoot) return <EmptyState>Open a folder to get started.</EmptyState>;
  if (!relPath) return <EmptyState>Select a Markdown file from the sidebar.</EmptyState>;
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

function EmptyState({ children }: { children: string }) {
  return <div className="viewer-message">{children}</div>;
}
