// Temporary: proves that watch-pr.mjs refuses to pass a red CI run (#2 AC2). Reverted next.
import { expect, it } from "vitest";

it("fails on purpose", () => {
  expect(1).toBe(2);
});
