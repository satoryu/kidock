import { useEffect, useState, type MouseEvent } from "react";
import { useApi } from "../api/context";
import { renderMarkdown } from "../markdown/render";
import { messageFor } from "./errors";

export type OpenFile = { projectId: number; relPath: string };

type ViewerProps = {
  file: OpenFile | null;
  /** Shown when no file is open. */
  placeholder: string;
};

type ViewState =
  | { status: "idle" }
  | { status: "loading"; html?: string }
  | { status: "ok"; html: string }
  | { status: "error"; error: unknown };

export function Viewer({ file, placeholder }: ViewerProps) {
  const api = useApi();
  const [view, setView] = useState<ViewState>({ status: "idle" });

  const projectId = file?.projectId;
  const relPath = file?.relPath;

  useEffect(() => {
    if (projectId === undefined || relPath === undefined) {
      setView({ status: "idle" });
      return;
    }
    let cancelled = false;
    // Keep showing the previous document while the next one loads (no flash).
    setView((prev) => ({ status: "loading", html: "html" in prev ? prev.html : undefined }));
    api
      .readMarkdown(projectId, relPath)
      .then(renderMarkdown)
      .then(
        (html) => !cancelled && setView({ status: "ok", html }),
        (error: unknown) => !cancelled && setView({ status: "error", error }),
      );
    return () => {
      cancelled = true;
    };
  }, [api, projectId, relPath]);

  // Never let the WebView navigate away. In-app .md links and external links come in #11.
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest("a")) e.preventDefault();
  };

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

function EmptyState({ children }: { children: string }) {
  return <div className="viewer-message">{children}</div>;
}
