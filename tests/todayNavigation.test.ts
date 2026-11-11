import { describe, expect, it, vi } from "vitest";
import type { IApi } from "@svar-ui/svelte-gantt";
import { navigateToToday } from "../src/ui/todayNavigation";
import { isoToDate } from "../src/ui/svarAdapter";

const range = { start: isoToDate("2026-10-01"), end: isoToDate("2026-11-01") };

function setup() {
  const exec = vi.fn();
  const notify = vi.fn();
  const api = { exec } as unknown as IApi;
  return { exec, notify, api };
}

describe("Today navigation", () => {
  it("scrolls the chart with a calendar week of context", () => {
    const { api, exec, notify } = setup();
    navigateToToday(api, range, "2026-10-21", notify);
    expect(exec).toHaveBeenCalledWith("scroll-chart", { date: isoToDate("2026-10-14") });
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(["2026-10-01", "2026-10-04"])("clamps the context to the start for %s", today => {
    const { api, exec, notify } = setup();
    navigateToToday(api, range, today, notify);
    expect(exec).toHaveBeenCalledWith("scroll-chart", { date: range.start });
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(["2026-09-30", "2026-11-01", "2026-11-09"])("warns without scrolling for %s", today => {
    const { api, exec, notify } = setup();
    navigateToToday(api, range, today, notify);
    expect(exec).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Сегодняшняя дата вне диапазона проекта");
  });

  it("does nothing before the chart is ready", () => {
    const { api, exec, notify } = setup();
    navigateToToday(null, range, "2026-10-21", notify);
    navigateToToday(api, null, "2026-10-21", notify);
    expect(exec).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
