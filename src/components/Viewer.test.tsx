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

async function api() {
  const mock = createMockApi(files);
  await mock.setRoot("/mock/reports");
  return mock;
}

describe("Viewer", () => {
  it("prompts to open a folder when there is no root", async () => {
    renderWithApi(<Viewer hasRoot={false} relPath={null} />, await api());
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();
  });

  it("prompts to select a file when none is selected", async () => {
    renderWithApi(<Viewer hasRoot relPath={null} />, await api());
    expect(screen.getByText(/select a markdown file/i)).toBeInTheDocument();
  });

  it("renders the selected file as sanitized HTML", async () => {
    renderWithApi(<Viewer hasRoot relPath="a.md" />, await api());
    expect(await screen.findByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("re-renders when the selection changes", async () => {
    const a = await api();
    const { rerender } = renderWithApi(<Viewer hasRoot relPath="a.md" />, a);
    await screen.findByRole("heading", { name: "Hello" });
    rerender(<Viewer hasRoot relPath="b.md" />);
    expect(await screen.findByRole("heading", { name: "Second" })).toBeInTheDocument();
  });

  it("makes link clicks inert (no WebView navigation)", async () => {
    renderWithApi(<Viewer hasRoot relPath="a.md" />, await api());
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
    const failing = { ...(await api()), readMarkdown: () => Promise.reject(new KidockError(kind, "x")) };
    renderWithApi(<Viewer hasRoot relPath="a.md" />, failing);
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });
});
