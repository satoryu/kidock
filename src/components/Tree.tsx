import { useEffect, useState, type KeyboardEvent } from "react";
import { useApi } from "../api/context";
import type { TreeEntry } from "../api/types";
import { messageFor } from "./errors";

type TreeProps = {
  projectId: number;
  /** Bump to refetch every expanded level in place (expansion is kept). */
  version?: number;
  selected: string | null;
  onSelect: (relPath: string) => void;
};

type Listing =
  | { status: "loading" }
  | { status: "ok"; entries: TreeEntry[] }
  | { status: "error"; error: unknown };

/** Folder tree of a project. Each directory level is fetched on demand. */
export function Tree(props: TreeProps) {
  return <DirChildren rel="" depth={0} {...props} />;
}

function DirChildren({
  projectId,
  version = 0,
  rel,
  depth,
  selected,
  onSelect,
}: TreeProps & { rel: string; depth: number }) {
  const api = useApi();
  const [listing, setListing] = useState<Listing>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    // On a refresh, keep showing the current entries until the new ones arrive.
    setListing((prev) => (prev.status === "ok" ? prev : { status: "loading" }));
    api.listDir(projectId, rel).then(
      (entries) => !cancelled && setListing({ status: "ok", entries }),
      (error: unknown) => !cancelled && setListing({ status: "error", error }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, projectId, rel, version]);

  const isRoot = rel === "";

  if (listing.status === "loading") {
    return <div className="tree-status">Loading…</div>;
  }
  if (listing.status === "error") {
    return (
      <div className="tree-status tree-error" role="alert">
        {messageFor(listing.error)}
      </div>
    );
  }
  if (isRoot && listing.entries.length === 0) {
    return <div className="tree-status">No Markdown files in this folder.</div>;
  }

  const items = listing.entries.map((entry) => (
    <TreeNode
      key={entry.relPath}
      projectId={projectId}
      version={version}
      entry={entry}
      depth={depth}
      selected={selected}
      onSelect={onSelect}
    />
  ));
  return isRoot ? (
    <ul className="tree" role="tree" aria-label="Files">
      {items}
    </ul>
  ) : (
    <ul className="tree-group" role="group">
      {items}
    </ul>
  );
}

function TreeNode({
  projectId,
  version,
  entry,
  depth,
  selected,
  onSelect,
}: TreeProps & { entry: TreeEntry; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const isDir = entry.kind === "dir";
  const isSelected = !isDir && entry.relPath === selected;

  const activate = () => (isDir ? setExpanded((v) => !v) : onSelect(entry.relPath));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  return (
    <li role="none">
      <div
        role="treeitem"
        tabIndex={0}
        aria-expanded={isDir ? expanded : undefined}
        aria-selected={isDir ? undefined : isSelected}
        className={`tree-item ${isDir ? "is-dir" : "is-file"}${isSelected ? " is-selected" : ""}`}
        style={{ "--depth": depth } as React.CSSProperties}
        title={entry.relPath}
        onClick={activate}
        onKeyDown={onKeyDown}
      >
        <span className="tree-icon" aria-hidden="true">
          {isDir ? (expanded ? "▾" : "▸") : "📄"}
        </span>
        <span className="tree-label">{entry.name}</span>
      </div>
      {isDir && expanded && (
        <DirChildren
          projectId={projectId}
          version={version}
          rel={entry.relPath}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </li>
  );
}
