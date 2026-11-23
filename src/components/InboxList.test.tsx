import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InboxItem } from "../api/types";
import { InboxList } from "./InboxList";

const NOW = new Date(2026, 10, 24, 15, 0).getTime();
const items: InboxItem[] = [
  { projectId: 1, projectName: "reports", relPath: "docs/plan.md", kind: "created", changedAt: NOW - 5 * 60_000, read: false },
  { projectId: 2, projectName: "agent", relPath: "log.md", kind: "updated", changedAt: NOW - 3 * 3_600_000, read: true },
];

function setup(overrides: Partial<Parameters<typeof InboxList>[0]> = {}) {
  const onOpen = vi.fn();
  const onMarkAllRead = vi.fn();
  render(
    <InboxList
      items={items}
      unreadTotal={1}
      selected={null}
      onOpen={onOpen}
      onMarkAllRead={onMarkAllRead}
      now={() => NOW}
      {...overrides}
    />,
  );
  return { onOpen, onMarkAllRead };
}

describe("InboxList", () => {
  it("lists items in the given order with name, project, folder, kind and time", () => {
    setup();
    const rows = within(screen.getByRole("list", { name: "Notifications" })).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("plan.md");
    expect(rows[0]).toHaveTextContent("reports · docs");
    expect(rows[0]).toHaveTextContent("5 min ago");
    expect(within(rows[0]).getByRole("img", { name: "New" })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("agent");
    expect(rows[1]).not.toHaveTextContent("·");
    expect(rows[1]).toHaveTextContent("3 h ago");
    expect(within(rows[1]).getByRole("img", { name: "Updated" })).toBeInTheDocument();
  });

  it("marks unread items", () => {
    setup();
    const [unread, read] = within(screen.getByRole("list")).getAllByRole("button");
    expect(unread).toHaveClass("is-unread");
    expect(within(unread).getByRole("img", { name: "unread" })).toBeInTheDocument();
    expect(read).not.toHaveClass("is-unread");
    expect(within(read).queryByRole("img", { name: "unread" })).not.toBeInTheDocument();
  });

  it("opens an item on click and highlights the selected one", async () => {
    const { onOpen } = setup({ selected: { projectId: 2, relPath: "log.md" } });
    const [first, second] = within(screen.getByRole("list")).getAllByRole("button");
    expect(second).toHaveAttribute("aria-current", "true");
    await userEvent.click(first);
    expect(onOpen).toHaveBeenCalledWith(items[0]);
  });

  it("offers mark all as read only when something is unread", async () => {
    const { onMarkAllRead } = setup();
    await userEvent.click(screen.getByRole("button", { name: /mark all as read/i }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });

  it("disables mark all as read when nothing is unread, and shows an empty state", () => {
    setup({ items: [], unreadTotal: 0 });
    expect(screen.getByRole("button", { name: /mark all as read/i })).toBeDisabled();
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
  });
});
