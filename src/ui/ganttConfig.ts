import type { IApi, IColumnConfig } from "@svar-ui/svelte-gantt";
import type { PlanRow, ProjectMarker } from "../core/types";
import type { DepthMove } from "../core/depth";
import type { ListMove } from "../core/edits";
import MoveCell from "./MoveCell.svelte";
import { STATUS_TYPES, isoToDate } from "./svarAdapter";

// Настройки SVAR, общие для приложения и HTML-экспорта.

export const taskTypes = [
  { id: "task", label: "Task" },
  { id: "summary", label: "Group" },
  { id: "milestone", label: "Milestone" },
  ...STATUS_TYPES.map(id => ({ id, label: id })),
];

export const scales = [
  { unit: "month", step: 1, format: "%F %Y" },
  { unit: "week", step: 1, format: "Нед. %W" },
  { unit: "day", step: 1, format: "%d" },
];

/**
 * Next day width for the −/+ buttons. Steps from the width SVAR actually draws,
 * not from our prop: with fixed start/end it stretches cells to fill the chart,
 * so stepping the prop below that width changes nothing visible and then «+»
 * has to climb back over it before the chart reacts.
 */
export function zoomCellWidth(api: IApi | null, current: number, delta: number): number {
  const shown = (api?.getState() as any)?.cellWidth ?? current;
  return Math.min(80, Math.max(8, shown + delta));
}

/**
 * Grid columns. `widths` are the user's resized widths: SVAR re-applies the
 * column config on every data refresh (i.e. after each file write), so without
 * passing them back a resized column would snap to its default.
 */
/**
 * The ⤒ ↑ ↓ ⤓ column: `can` = null → no buttons on that row. Reaches the cell
 * through Svelte context (MOVER_KEY): SVAR drops unknown column fields.
 */
export const MOVER_KEY = "pp-mover";
export interface RowMover {
  can(row: PlanRow): { up: boolean; down: boolean; indent: boolean; outdent: boolean } | null;
  move(row: PlanRow, move: ListMove | DepthMove): void;
}

export function columns(withAdd: boolean, widths: Record<string, number> = {}): IColumnConfig[] {
  const cols: IColumnConfig[] = [
    ...(withAdd ? [{ id: "move", header: "", width: 110, cell: MoveCell } as IColumnConfig] : []),
    { id: "text", header: "Задача", flexgrow: 1, width: 260 },
    { id: "start", header: "Старт", width: 92, align: "center", template: (_v: unknown, row: any) => row.startIso },
    { id: "due", header: "Финиш", width: 92, align: "center", template: (_v: unknown, row: any) => row.due },
    { id: "duration", header: "Дней", width: 76, align: "center" },
  ];
  if (withAdd) cols.push({ id: "add-task", header: "", width: 36 });
  return cols.map(c => {
    const w = c.id ? widths[c.id] : undefined;
    if (!w) return c;
    // A fixed width beats flexgrow, otherwise "text" would stretch back.
    const { flexgrow: _flex, ...rest } = c;
    return { ...rest, width: c.id === "move" ? Math.max(110, w) : w };
  });
}

// ── Grid layout memory (column widths + grid/chart splitter) ─────────────────

export interface GridLayout {
  widths: Record<string, number>;
  gridWidth: number | null;
}

export function dayKey(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** SVAR `highlightTime`: weekends + days lit by clicking the scale. */
export function makeHighlightTime(weekendDays: number[], lit: Set<number> = new Set()) {
  const weekend = new Set(weekendDays);
  return (date: Date, unit: string) => {
    if (unit !== "day") return "";
    const cls: string[] = [];
    if (weekend.has(date.getDay())) cls.push("pp-weekend");
    if (lit.has(dayKey(date))) cls.push("pp-day-highlight");
    return cls.join(" ");
  };
}

/** "Сегодня" + frontmatter markers. */
export type ChartMarker = ProjectMarker & { today?: boolean };

export function allMarkers(markers: ProjectMarker[], today: string): ChartMarker[] {
  return [
    { date: today, label: "Сегодня", color: "#2f80ed", today: true },
    ...markers.map(m => ({ ...m, date: String(m.date) })),
  ];
}

/**
 * Svelte action drawing vertical markers. SVAR's own `markers` are a PRO
 * feature, so we draw them into the chart's scrolling area using its scale
 * geometry (`_scales` — internal state, see design.md §8).
 */
export function markerLayer(
  node: HTMLElement,
  /** `today` is only a trigger: when the day changes, Svelte calls `update` and the layer redraws. */
  params: { api: () => IApi | null; markers: () => ChartMarker[]; today: string }
) {
  let current = params;
  const win = node.ownerDocument.defaultView!;
  const layer = node.ownerDocument.createElement("div");
  layer.className = "pp-markers";
  let raf = 0;
  let drawn = "";
  const draw = () => {
    raf = 0;
    const area = node.querySelector(".wx-chart .wx-area");
    const s = (current.api()?.getState() as any)?._scales;
    if (!area || !s?.start) return;
    if (layer.parentElement !== area) area.appendChild(layer);
    const width = s.lengthUnitWidth;
    const html = current.markers()
      .map(m => {
        const left = ((isoToDate(m.date).getTime() - s.start.getTime()) / 86_400_000) * width + width / 2;
        return `<div class="pp-marker${m.today ? " pp-marker-today" : ""}" style="left:${left}px;--c:${escapeHtml(m.color)}"><span>${escapeHtml(m.label)}</span></div>`;
      })
      .join("");
    // The observer below sees the layer's own writes too: rewriting the same
    // HTML would re-trigger it and redraw every frame forever.
    if (html !== drawn) layer.innerHTML = drawn = html;
  };
  // The chart re-renders on data/zoom/resize; redraw lazily after DOM changes.
  const observer = new win.MutationObserver(() => { if (!raf) raf = win.requestAnimationFrame(draw); });
  observer.observe(node, { childList: true, subtree: true });
  draw();
  return {
    update(next: typeof params) { current = next; draw(); },
    destroy() { observer.disconnect(); win.cancelAnimationFrame(raf); layer.remove(); },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** `#stage…` tags of the project: declared in frontmatter first, then any found on tasks. */
export function projectStages(declared: string[] | undefined, found: string[]): string[] {
  const list = [...(declared ?? []).map(String)];
  for (const s of found) if (!list.includes(s)) list.push(s);
  return list;
}
