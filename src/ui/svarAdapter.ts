import type { ITask, ILink } from "@svar-ui/svelte-gantt";
import type { Plan, PlanRow, ProjectColors } from "../core/types";

// PlanRow (ISO, включительный end) ⇄ SVAR ITask (Date, исключающий end).
// Единственное место, знающее о формате SVAR.

export const STATUS_TYPES = ["done", "cancelled", "critical", "blocked", "in-progress"] as const;

export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dateToIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Custom SVAR task type → CSS class `wx-<type>` on the bar, coloured in App.svelte. */
function barType(row: PlanRow): string {
  if (row.kind === "root" || row.kind === "group") return "summary";
  if (row.kind === "milestone") return "milestone";
  if (row.cancelled) return "cancelled";
  if (row.critical) return "critical";
  if (row.done) return "done";
  if (row.task?.tags.includes("blocked")) return "blocked";
  if (row.task?.tags.includes("in-progress")) return "in-progress";
  return "task";
}

export interface SvarTask extends ITask {
  /** Inclusive due date shown in the grid ("Финиш"). */
  due: string;
  startIso: string;
  row: PlanRow;
}

export function toSvar(plan: Plan, collapsed: Set<string>): { tasks: SvarTask[]; links: ILink[] } {
  const hasChildren = new Set(plan.rows.map(r => r.parent).filter(Boolean) as string[]);
  const tasks: SvarTask[] = plan.rows.map(row => {
    const start = isoToDate(row.start);
    return {
      id: row.id,
      parent: row.parent ?? 0,
      text: row.text,
      start,
      // SVAR end is exclusive; a milestone is a point and only needs start.
      end: row.kind === "milestone" ? start : addDays(isoToDate(row.end), 1),
      progress: Math.round(row.progress * 100),
      type: barType(row),
      open: hasChildren.has(row.id) ? !collapsed.has(row.id) : undefined,
      due: row.end,
      startIso: row.start,
      row,
    };
  });
  const links: ILink[] = plan.links.map(l => ({ id: l.id, source: l.source, target: l.target, type: "e2s" }));
  return { tasks, links };
}

/**
 * Timeline span snapped to whole Monday-based weeks, so the week scale never
 * starts or ends with a clipped cell. Covers the plan and its markers, plus a
 * trailing week of room for milestone labels. `end` is exclusive.
 */
export function weekRange(plan: Plan): { start: Date; end: Date } {
  const dates = [...plan.rows.flatMap(r => [r.start, r.end]), ...plan.markers.map(m => String(m.date))].sort();
  const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
  // a day of left margin, so a bar starting on Monday isn't glued to the edge
  const start = monday(addDays(isoToDate(dates[0]), -1));
  const end = addDays(monday(isoToDate(dates[dates.length - 1])), 14);
  return { start, end };
}

/** Dates of a dragged bar back to the file's inclusive ISO form. */
export function fromSvarDates(task: { start?: Date | null; end?: Date | null }, milestone: boolean): { start: string; end: string } | null {
  if (!task.start) return null;
  const start = dateToIso(task.start);
  if (milestone) return { start, end: start };
  const end = task.end ? dateToIso(addDays(task.end, -1)) : start;
  return { start, end: end < start ? start : end };
}

/** Per-project bar colours from frontmatter, as CSS for the custom task types. */
export function colorCss(colors: ProjectColors = {}): string {
  const c = {
    task: colors.todo ?? "#A8D5E2",
    "in-progress": colors["in-progress"] ?? "#F6AE2D",
    done: colors.done ?? "#6BBF59",
    cancelled: colors.cancelled ?? "#B8BEC7",
    blocked: colors.blocked ?? "#E84855",
    critical: colors.critical ?? "#E84855",
    milestone: colors.milestone ?? "#9B5DE5",
    summary: colors.group ?? "#7B8CDE",
  };
  // SVAR renders built-in types as `wx-<type>`, custom ones as `wx-task <type>`;
  // a milestone's diamond is the inner .wx-content, not the bar itself.
  const selector = (type: string) =>
    type === "milestone" ? ".wx-bar.wx-milestone .wx-content"
      : type === "task" || type === "summary" ? `.wx-bar.wx-${type}`
      : `.wx-bar.wx-task.${type}`;
  return Object.entries(c)
    .map(([type, color]) => `.pp-gantt ${selector(type)} { background-color: ${color}; border-color: ${color}; }`)
    .join("\n");
}

/**
 * Per-row status the bar type can't carry. A milestone must keep SVAR's
 * built-in type to be drawn as a diamond, so its status colours and critical
 * outlines use `data-id`, as the overdue outline does; so do the grid rows of
 * cancelled tasks (struck through).
 */
export function statusCss(plan: Plan | null | undefined, colors: ProjectColors = {}): string {
  const rows = plan?.rows ?? [];
  const id = (r: PlanRow) => JSON.stringify(`:${r.id}`);
  const diamond = (r: PlanRow) => `.pp-gantt .wx-bar.wx-milestone[data-id=${id(r)}] .wx-content`;
  const rule = (selectors: string[], body: string) => (selectors.length ? `${selectors.join(",\n")} { ${body} }` : "");
  const done = colors.done ?? "#6BBF59";
  const cancelled = colors.cancelled ?? "#B8BEC7";
  const critical = colors.critical ?? "#E84855";
  const blocked = colors.blocked ?? "#E84855";
  return [
    rule(rows.filter(r => r.kind === "milestone" && r.task?.tags.includes("blocked") && !r.done && !r.cancelled).map(diamond), `background-color: ${blocked}; border-color: ${blocked};`),
    rule(rows.filter(r => r.kind === "milestone" && r.critical && !r.done && !r.cancelled).map(diamond), `outline: 2px solid ${critical}; outline-offset: 1px;`),
    rule(rows.filter(r => r.kind === "milestone" && r.done).map(diamond), `background-color: ${done}; border-color: ${done};`),
    rule(rows.filter(r => r.kind === "milestone" && r.cancelled).map(diamond), `background-color: ${cancelled}; border-color: ${cancelled};`),
    rule(rows.filter(r => r.cancelled).map(r => `.pp-gantt .wx-row[data-id=${id(r)}] .wx-cell`), "color: #9ca3af; text-decoration: line-through;"),
  ].filter(Boolean).join("\n");
}

/** Open task whose own 📅 is before today. Inherited / computed dates don't count. */
export function isOverdue(row: PlanRow, today: string): boolean {
  const t = row.task;
  return !!t && !t.done && !t.cancelled && !!t.dueDate && t.dueDate < today;
}

/**
 * Red outline for overdue bars. SVAR has no per-task class, so the rule goes by
 * the bar's `data-id` (":" + id for string ids). The offset keeps it visible on
 * red (blocked / critical) bars too.
 */
export function overdueCss(plan: Plan | null | undefined, today: string): string {
  const ids = (plan?.rows ?? []).filter(r => isOverdue(r, today)).map(r => JSON.stringify(`:${r.id}`));
  if (!ids.length) return "";
  const bar = (id: string) => `.pp-gantt .wx-bar[data-id=${id}]:not(.wx-milestone)`;
  const diamond = (id: string) => `.pp-gantt .wx-bar.wx-milestone[data-id=${id}] .wx-content`;
  return `${ids.flatMap(id => [bar(id), diamond(id)]).join(",\n")} { outline: 2px solid #d0021b; outline-offset: 1px; }`;
}
