import type { IApi } from "@svar-ui/svelte-gantt";
import { addDays, isoToDate } from "./svarAdapter";

/** Navigate within the existing timeline; its end is exclusive. */
export function navigateToToday(
  api: IApi | null,
  range: { start: Date; end: Date } | null,
  today: string,
  notify: (text: string) => void,
): void {
  if (!api || !range) return;
  const date = isoToDate(today);
  if (date < range.start || date >= range.end) {
    notify("Сегодняшняя дата вне диапазона проекта");
    return;
  }
  const target = addDays(date, -7);
  void api.exec("scroll-chart", { date: target < range.start ? range.start : target });
}
