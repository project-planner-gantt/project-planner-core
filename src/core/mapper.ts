import type {
  ParsedProject, TaskGroup, TaskLine, ProjectColors, Plan, PlanRow, PlanLink,
} from "./types";
import { flatGroupTasks, flatTaskLines, allTasks } from "./parser";
import { todayIso } from "./taskLineEditor";

// Порт DataMapper. Правила вывода дат и цветов те же, что в плагине; отличие —
// результат в нейтральной PlanRow (ISO, включительный end), а не в формате
// dhtmlx («DD-MM-YYYY», исключающий end_date). Перевод в формат рисовалки —
// забота адаптера.

export const ROOT_ID = "__root__";

function taskColor(task: TaskLine, colors: ProjectColors): string {
  if (task.cancelled) return colors.cancelled ?? "#B8BEC7";
  if (task.isCritical) return colors.critical ?? "#E84855";
  if (task.isMilestone) return colors.milestone ?? "#9B5DE5";
  if (task.done) return colors.done ?? "#6BBF59";
  if (task.tags.includes("blocked")) return colors.blocked ?? "#E84855";
  if (task.tags.includes("in-progress")) return colors["in-progress"] ?? "#F6AE2D";
  return colors.todo ?? "#A8D5E2";
}

const ownStart = (t: TaskLine) => t.startDate ?? t.scheduledDate ?? t.dueDate ?? null;
const ownEnd   = (t: TaskLine) => t.dueDate ?? t.startDate ?? t.scheduledDate ?? null;

const minIso = (xs: (string | null)[]) => (xs.filter(Boolean) as string[]).sort()[0] ?? null;
const maxIso = (xs: (string | null)[]) => (xs.filter(Boolean) as string[]).sort().reverse()[0] ?? null;

/**
 * `externalIndex` maps "file#blockId" of a remote dependency to the row id it
 * should link from. Remote deps that aren't in the index are skipped.
 */
export function mapProject(project: ParsedProject, externalIndex: Map<string, string> = new Map()): Plan {
  const rows: PlanRow[] = [];
  const links: PlanLink[] = [];
  const colors = project.frontmatter.colors ?? {};

  const processTask = (task: TaskLine, parentId: string, inheritedStart: string | null, inheritedEnd: string | null) => {
    let start = ownStart(task);
    let end = ownEnd(task);

    // No own dates → derive from subtasks
    if (!start && !end && task.subtasks.length) {
      const subs = task.subtasks.flatMap(flatTaskLines);
      start = minIso(subs.map(ownStart));
      end = maxIso(subs.map(ownEnd));
    }
    // Still missing → inherit from ancestor task, finally today
    start ??= inheritedStart ?? todayIso();
    end ??= inheritedEnd ?? todayIso();
    if (end < start) end = start;

    rows.push({
      id: task.id,
      parent: parentId,
      kind: task.isMilestone ? "milestone" : "task",
      text: `${task.number ? task.number + " | " : ""}${task.description}`,
      // Milestone is a single instant pinned to its due date.
      start: task.isMilestone ? end : start,
      end,
      progress: task.done ? 1 : (task.progress ?? 0),
      color: taskColor(task, colors),
      done: task.done,
      cancelled: task.cancelled || undefined,
      critical: task.isCritical,
      task,
    });

    for (const dep of task.dependsOn) {
      if (dep.type === "local") {
        links.push({ id: `link-${dep.id}-${task.id}`, source: dep.id, target: task.id, external: false });
      } else {
        const src = externalIndex.get(`${dep.file}#${dep.id}`);
        if (src) links.push({ id: `link-ext-${dep.id}-${task.id}`, source: src, target: task.id, external: true });
      }
    }

    for (const sub of task.subtasks) processTask(sub, task.id, start, end);
  };

  const emptyGroups = new Set<string>();
  const processGroup = (group: TaskGroup, parentId: string) => {
    const tasks = flatGroupTasks(group);
    // A heading whose subtree holds no task but has text is notes — drop it.
    // A bare heading is a group waiting for its tasks (e.g. just added) — keep it.
    if (tasks.length === 0 && !isBlankGroup(group)) return;

    const id = `group-${group.filePath}-${group.lineNumber}`;
    if (tasks.length === 0) emptyGroups.add(id);
    const start = minIso(tasks.map(ownStart)) ?? todayIso();
    const end = maxIso(tasks.map(ownEnd)) ?? start;
    rows.push({
      id,
      parent: parentId,
      kind: "group",
      text: group.heading,
      start,
      end,
      progress: shareDone(tasks),
      color: colors.group,
      done: false,
      critical: false,
      group,
    });
    for (const t of group.tasks) processTask(t, id, null, null);
    for (const sub of group.subgroups) processGroup(sub, id);
  };

  // The project's `# ` heading IS the root row — its own tasks and sections hang
  // straight off it. Any heading before the H1 stays under the root as a group.
  const h1 = project.groups.find(g => g.level === 1) ?? null;
  for (const group of project.groups) {
    if (group === h1) {
      for (const t of group.tasks) processTask(t, ROOT_ID, null, null);
      for (const sub of group.subgroups) processGroup(sub, ROOT_ID);
    } else {
      processGroup(group, ROOT_ID);
    }
  }

  const all = allTasks(project);
  // an empty group sits on today only for display; it must not stretch the root
  const dated = rows.filter(r => !emptyGroups.has(r.id));
  const rootStart = minIso(dated.map(r => r.start)) ?? todayIso();
  const rootEnd = maxIso(dated.map(r => r.end)) ?? rootStart;
  rows.unshift({
    id: ROOT_ID,
    parent: null,
    kind: "root",
    text: h1?.heading ?? project.title,
    start: rootStart,
    end: rootEnd,
    progress: shareDone(all),
    color: colors.group,
    done: false,
    critical: false,
    group: h1 ?? undefined,
  });

  // A local link to an id that isn't in this file would crash most gantt libs.
  const ids = new Set(rows.map(r => r.id));
  const validLinks = links.filter(l => ids.has(l.source) && ids.has(l.target));

  return { title: project.title, rows, links: validLinks, markers: project.frontmatter.markers ?? [] };
}

/** Share of done tasks; cancelled ones don't count either way. */
function shareDone(tasks: TaskLine[]): number {
  const live = tasks.filter(t => !t.cancelled);
  return live.length ? live.filter(t => t.done).length / live.length : 0;
}

/** No text anywhere in the subtree: only headings, blank lines and `---`. */
function isBlankGroup(group: TaskGroup): boolean {
  return !group.hasContent && group.subgroups.every(isBlankGroup);
}

// ── Stage-tag filtering ──────────────────────────────────────────────────────

export const STAGE_TAG_PREFIX = "stage";

export function collectStageTags(rows: PlanRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const tag of r.task?.tags ?? []) if (tag.startsWith(STAGE_TAG_PREFIX)) set.add(tag);
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Keep only tasks carrying `tag`, plus their ancestor group rows and the root.
 * A surviving task is re-parented to its nearest surviving ancestor. Group
 * spans are NOT recomputed — they keep the values of the full tree.
 */
export function filterByStageTag(plan: Plan, tag: string): Plan {
  const byId = new Map(plan.rows.map(r => [r.id, r]));
  const isGroupRow = (r?: PlanRow) => !!r && (r.kind === "root" || r.kind === "group");

  const keep = new Set<string>([ROOT_ID]);
  for (const r of plan.rows) {
    if (!r.task?.tags.includes(tag)) continue;
    keep.add(r.id);
    for (let p = r.parent ? byId.get(r.parent) : undefined; p; p = p.parent ? byId.get(p.parent) : undefined) {
      if (isGroupRow(p)) keep.add(p.id);
    }
  }

  const nearestKept = (r: PlanRow): string | null => {
    for (let p = r.parent ? byId.get(r.parent) : undefined; p; p = p.parent ? byId.get(p.parent) : undefined) {
      if (keep.has(p.id)) return p.id;
    }
    return null;
  };

  return {
    ...plan,
    rows: plan.rows.filter(r => keep.has(r.id)).map(r => (r.task ? { ...r, parent: nearestKept(r) ?? r.parent } : r)),
    links: plan.links.filter(l => keep.has(l.source) && keep.has(l.target)),
  };
}
