import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  chooseDurationMonths,
  evaluate,
} from "../src/backend/domain/cycles";

const cycle = {
  id: "cycle-1",
  installationId: "install-1",
  startedAt: "2026-01-31T12:00:00.000Z",
  durationMonths: 2,
  dueAt: "2026-03-31T12:00:00.000Z",
  status: "active" as const,
};

describe("maintenance evaluation seam", () => {
  it.each([
    [15, null],
    [14, "once_in_final_14_days"],
    [8, "once_in_final_14_days"],
    [7, "daily_in_final_7_days"],
    [1, "daily_in_final_7_days"],
    [0, "each_open_after_expiry"],
  ])("returns the server-side stage at %i days", (days, frequency) => {
    const now = new Date(Date.parse(cycle.dueAt) - days * 24 * 60 * 60 * 1000);
    const notice = evaluate(now, cycle, [], "Soporte");
    expect(notice?.frequency ?? null).toBe(frequency);
  });

  it("does not repeat a non-expired notice already recorded today", () => {
    const now = new Date(Date.parse(cycle.dueAt) - 10 * 24 * 60 * 60 * 1000);
    expect(
      evaluate(now, cycle, ["notice:final_14_days"], "Soporte"),
    ).toBeNull();
  });

  it("always returns expiry consent", () => {
    const notice = evaluate(
      new Date(cycle.dueAt),
      cycle,
      ["notice:expired"],
      "Soporte",
    );
    expect(notice).toMatchObject({
      severity: "critical",
      requires_consent: true,
      countdown_seconds: 5,
      closable: false,
    });
  });
});

describe("server cycle calculation seam", () => {
  it("chooses every duration from 2 through 6 without modulo bias", () => {
    expect(
      [0, 1, 2, 3, 4].map((value) =>
        chooseDurationMonths(new Uint32Array([value])),
      ),
    ).toEqual([2, 3, 4, 5, 6]);
  });

  it("clamps month-end dates instead of rolling into an extra month", () => {
    expect(
      addCalendarMonths(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString(),
    ).toBe("2026-02-28T12:00:00.000Z");
  });
});
