import { useEffect, useState } from "react";
import type { InboxItem } from "../api/types";
import { formatFull, formatRelative } from "../util/relativeTime";
import type { OpenFile } from "./Viewer";

type Props = {
  items: InboxItem[];
  unreadTotal: number;
  selected: OpenFile | null;
  onOpen: (item: InboxItem) => void;
  onMarkAllRead: () => void;
  /** Injectable clock for tests. */
  now?: () => number;
};

/** Center bar content for the Inbox: newest changes first, unread in bold. */
export function InboxList({ items, unreadTotal, selected, onOpen, onMarkAllRead, now = Date.now }: Props) {
  // Re-render every minute so relative times stay current.
  const [nowMs, setNowMs] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setNowMs(now()), 60_000);
    return () => clearInterval(id);
  }, [now]);

  return (
    <section className="center-bar" aria-label="Inbox">
      <header className="pane-header pane-header-row">
        <h2 className="pane-title">Inbox</h2>
        <button
          type="button"
          className="text-button"
          onClick={onMarkAllRead}
          disabled={unreadTotal === 0}
        >
          Mark all as read
        </button>
      </header>
      {items.length === 0 ? (
        <p className="pane-empty">No notifications yet.</p>
      ) : (
        <ul className="inbox-list" aria-label="Notifications">
          {items.map((item) => {
            const isSelected =
              selected?.projectId === item.projectId && selected.relPath === item.relPath;
            const slash = item.relPath.lastIndexOf("/");
            const name = item.relPath.slice(slash + 1);
            const folder = slash > 0 ? item.relPath.slice(0, slash) : "";
            const created = item.kind === "created";
            return (
              <li key={`${item.projectId}/${item.relPath}`}>
                <button
                  type="button"
                  className={`inbox-item${item.read ? "" : " is-unread"}${isSelected ? " is-selected" : ""}`}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onOpen(item)}
                >
                  <span
                    className={`inbox-kind ${created ? "is-created" : "is-updated"}`}
                    role="img"
                    aria-label={created ? "New" : "Updated"}
                    title={created ? "New file" : "Updated"}
                  >
                    {created ? "＋" : "✎"}
                  </span>
                  <span className="inbox-main">
                    <span className="inbox-name">
                      {!item.read && <span className="unread-dot" aria-label="unread" role="img" />}
                      {name}
                    </span>
                    <span className="inbox-meta">
                      {item.projectName}
                      {folder && ` · ${folder}`}
                    </span>
                  </span>
                  <time className="inbox-time" dateTime={new Date(item.changedAt).toISOString()} title={formatFull(item.changedAt)}>
                    {formatRelative(item.changedAt, nowMs)}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
