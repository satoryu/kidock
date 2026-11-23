import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiProvider } from "../api/context";
import { createMockApi } from "../api/mockApi";
import { KidockError } from "../api/types";
import { renderWithApi } from "../test/utils";
import { Viewer } from "./Viewer";

const files = {
  "a.md": "# Hello\n\n[link](https://example.com)\n\n<script>window.__pwned = true</script>",
  "b.md": "# Second",
};

const api = () => createMockApi({ projects: [{ name: "reports", path: "/mock/reports", files }] });
const open = (relPath: string) => ({ projectId: 1, relPath });

describe("Viewer", () => {
  it("shows the placeholder when no file is open", () => {
    renderWithApi(<Viewer file={null} placeholder="Select a Markdown file." />, api());
    expect(screen.getByText("Select a Markdown file.")).toBeInTheDocument();
  });

  it("renders the selected file as sanitized HTML", async () => {
    renderWithApi(<Viewer file={open("a.md")} placeholder="" />, api());
    expect(await screen.findByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("re-renders when the selection changes", async () => {
    const a = api();
    const { rerender } = renderWithApi(<Viewer file={open("a.md")} placeholder="" />, a);
    await screen.findByRole("heading", { name: "Hello" });
    rerender(<Viewer file={open("b.md")} placeholder="" />);
    expect(await screen.findByRole("heading", { name: "Second" })).toBeInTheDocument();
  });

  it("reloads when the same path is opened in another project", async () => {
    const two = createMockApi({
      projects: [
        { name: "a", path: "/mock/a", files: { "README.md": "# From A" } },
        { name: "b", path: "/mock/b", files: { "README.md": "# From B" } },
      ],
    });
    const { rerender } = renderWithApi(
      <Viewer file={{ projectId: 1, relPath: "README.md" }} placeholder="" />,
      two,
    );
    await screen.findByRole("heading", { name: "From A" });
    rerender(<Viewer file={{ projectId: 2, relPath: "README.md" }} placeholder="" />);
    expect(await screen.findByRole("heading", { name: "From B" })).toBeInTheDocument();
  });

  describe("reloading in place", () => {
    afterEach(() => document.querySelectorAll("main.pane-main").forEach((el) => el.remove()));
    /** Renders the viewer as a direct child of a scrollable pane (as in App). */
    function renderInPane(ui: React.ReactElement, mock: ReturnType<typeof createMockApi>) {
      const pane = document.createElement("main");
      pane.className = "pane pane-main";
      document.body.appendChild(pane);
      const r = render(ui, {
        container: pane,
        wrapper: ({ children }) => <ApiProvider api={mock}>{children}</ApiProvider>,
      });
      return { ...r, pane };
    }

    it("re-renders the same file on a new version and keeps the scroll offset", async () => {
      const mock = api();
      const file = open("a.md");
      const { rerender, pane } = renderInPane(<Viewer file={file} version={0} placeholder="" />, mock);
      await screen.findByRole("heading", { name: "Hello" });
      pane.scrollTop = 240;

      mock.emitChanges([{ projectId: 1, relPath: "a.md", kind: "updated", content: "# Hello again" }]);
      rerender(<Viewer file={file} version={1} placeholder="" />);
      expect(await screen.findByRole("heading", { name: "Hello again" })).toBeInTheDocument();
      expect(pane.scrollTop).toBe(240);
    });

    it("starts a different file at the top", async () => {
      const mock = api();
      const { rerender, pane } = renderInPane(<Viewer file={open("a.md")} placeholder="" />, mock);
      await screen.findByRole("heading", { name: "Hello" });
      pane.scrollTop = 240;
      rerender(<Viewer file={open("b.md")} placeholder="" />);
      await screen.findByRole("heading", { name: "Second" });
      expect(pane.scrollTop).toBe(0);
    });

    it("shows that a deleted file no longer exists", async () => {
      const mock = api();
      const file = open("a.md");
      const { rerender } = renderWithApi(<Viewer file={file} version={0} placeholder="" />, mock);
      await screen.findByRole("heading", { name: "Hello" });
      mock.emitChanges([{ projectId: 1, relPath: "a.md", kind: "deleted" }]);
      rerender(<Viewer file={file} version={1} placeholder="" />);
      expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
    });

    it("ignores a stale response when a newer version finishes first", async () => {
      const mock = api();
      let releaseFirst!: () => void;
      let calls = 0;
      const slowFirst = {
        ...mock,
        readMarkdown: async (p: number, r: string) => {
          calls++;
          if (calls === 2) {
            await new Promise<void>((res) => (releaseFirst = res));
            return "# Stale";
          }
          return mock.readMarkdown(p, r);
        },
      };
      const file = open("a.md");
      const { rerender } = renderWithApi(<Viewer file={file} version={0} placeholder="" />, slowFirst);
      await screen.findByRole("heading", { name: "Hello" });
      rerender(<Viewer file={file} version={1} placeholder="" />); // slow, will be stale
      mock.emitChanges([{ projectId: 1, relPath: "a.md", kind: "updated", content: "# Fresh" }]);
      rerender(<Viewer file={file} version={2} placeholder="" />);
      expect(await screen.findByRole("heading", { name: "Fresh" })).toBeInTheDocument();
      releaseFirst();
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByRole("heading", { name: "Stale" })).not.toBeInTheDocument();
    });
  });

  it("makes link clicks inert (no WebView navigation)", async () => {
    renderWithApi(<Viewer file={open("a.md")} placeholder="" />, api());
    const link = await screen.findByRole("link", { name: "link" });
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false);
  });

  it.each([
    ["NotFound", /no longer exists/i],
    ["PermissionDenied", /permission/i],
    ["NotUtf8", /utf-8/i],
    ["OutsideRoot", /outside/i],
  ] as const)("shows a specific message for %s", async (kind, text) => {
    const failing = { ...api(), readMarkdown: () => Promise.reject(new KidockError(kind, "x")) };
    renderWithApi(<Viewer file={open("a.md")} placeholder="" />, failing);
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });
});
