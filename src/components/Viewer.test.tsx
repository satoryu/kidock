import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
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
