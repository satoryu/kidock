import { describe, expect, it } from "vitest";
import { formatRelative } from "./relativeTime";

const MIN = 60_000;
const HOUR = 60 * MIN;
// A fixed local "now": 2026-11-24 15:00.
const now = new Date(2026, 10, 24, 15, 0, 0).getTime();

describe("formatRelative", () => {
  it.each([
    [now, "just now"],
    [now - 30_000, "just now"],
    [now + 5_000, "just now"], // small clock skew
    [now - MIN, "1 min ago"],
    [now - 59 * MIN, "59 min ago"],
    [now - HOUR, "1 h ago"],
    [now - 14 * HOUR, "14 h ago"],
  ])("formats %d", (t, expected) => {
    expect(formatRelative(t, now)).toBe(expected);
  });

  it("says yesterday for the previous calendar day beyond 24 h of hours", () => {
    const yesterdayMorning = new Date(2026, 10, 23, 9, 0).getTime();
    expect(formatRelative(yesterdayMorning, now)).toBe("yesterday");
  });

  it("uses a short date for older items, with the year only when it differs", () => {
    expect(formatRelative(new Date(2026, 10, 20, 9, 0).getTime(), now)).toBe("Nov 20");
    expect(formatRelative(new Date(2025, 0, 5, 9, 0).getTime(), now)).toBe("Jan 5, 2025");
  });
});
