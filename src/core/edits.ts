// Порт FileWriter: те же правки строк, но как чистые функции
// `lines -> lines`. Чтение/запись файла и защита от конфликтов — в ProjectStore.

import type { TaskGroup, TaskLine } from "./types";
import { todayIso } from "./taskLineEditor";

export type Lines = string[];

/** A task line: `- [ ]`, `- [x]`, `- [-]`. */
const TASK_HEAD_RE = /^\s*- \[.\] /;

// Task's OWN block id: ^xxx at end of line that is NOT a dependency ref (⛔ ^xxx).
const OWN_BLOCK_RE = /(?<!⛔ )\^[\w-]+\s*$/;

export function newBlockId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function withLine(lines: Lines, n: number, update: (line: string) => string): Lines {
  if (lines[n] === undefined) return lines;
  const next = [...lines];
  next[n] = update(lines[n]);
  return next;
}

/** Insert `token` before ⛔, then before own ^id, else append. */
function insertBeforeTail(line: string, token: string): string {
  if (/⛔/.test(line)) return line.replace(/⛔/, `${token} ⛔`);
  if (OWN_BLOCK_RE.test(line)) return line.replace(OWN_BLOCK_RE, `${token} $&`);
  return `${line.trimEnd()} ${token}`;
}

/**
 * New start/due after a bar drag or resize. Which dates the line carries is read
 * from the line itself, never from TaskLine fields (they may be updated
 * optimistically by the UI before the write).
 */
/**
 * The task's own start and due. `null` removes that date: a task without its
 * own dates takes its span from its subtasks (see mapper).
 */
export function setTaskDates(lines: Lines, task: TaskLine, startIso: string | null, endIso: string | null): Lines {
  return withLine(lines, task.lineNumber, original => {
    let updated = original;
    if (startIso === null) {
      updated = updated.replace(/\s*(?:🛫|⏳) \d{4}-\d{2}-\d{2}/g, "");
    } else if (/🛫 \d{4}-\d{2}-\d{2}/.test(original)) {
      updated = updated.replace(/🛫 \d{4}-\d{2}-\d{2}/, `🛫 ${startIso}`);
    } else if (/⏳ \d{4}-\d{2}-\d{2}/.test(original)) {
      updated = updated.replace(/⏳ \d{4}-\d{2}-\d{2}/, `⏳ ${startIso}`);
    } else if (/📅/.test(updated)) {
      updated = updated.replace(/📅/, `⏳ ${startIso} 📅`);
    } else {
      updated = insertBeforeTail(updated, `⏳ ${startIso}`);
    }
    return endIso === null ? updated.replace(/\s*📅 \d{4}-\d{2}-\d{2}/, "") : setDue(updated, endIso);
  });
}

function setDue(line: string, endIso: string): string {
  if (/📅 \d{4}-\d{2}-\d{2}/.test(line)) return line.replace(/📅 \d{4}-\d{2}-\d{2}/, `📅 ${endIso}`);
  return insertBeforeTail(line, `📅 ${endIso}`);
}

export function setMilestoneDate(lines: Lines, task: TaskLine, endIso: string): Lines {
  return withLine(lines, task.lineNumber, line => setDue(line, endIso));
}

export function closeTask(lines: Lines, task: TaskLine, today = todayIso()): Lines {
  return withLine(lines, task.lineNumber, line => {
    line = line.replace(/- \[ \]/, "- [x]");
    // ⏳ → 🛫 when closing a task that never formally started
    if (!/🛫 \d{4}/.test(line)) line = line.replace(/⏳ (\d{4}-\d{2}-\d{2})/, `🛫 $1`);
    if (/✅ \d{4}-\d{2}-\d{2}/.test(line)) return line.replace(/✅ \d{4}-\d{2}-\d{2}/, `✅ ${today}`);
    const withDone = line.replace(/(\^[\w-]+\s*$)/, `✅ ${today} $1`);
    return withDone.includes("✅") ? withDone : `${line.trimEnd()} ✅ ${today}`;
  });
}

/** Cancel an open task: `[ ]` → `[-]`. Dates stay; the chart greys it out. */
export function cancelTask(lines: Lines, task: TaskLine): Lines {
  return withLine(lines, task.lineNumber, line => line.replace(/- \[ \]/, "- [-]"));
}

/** Undo a cancel: `[-]` → `[ ]`. */
export function restoreTask(lines: Lines, task: TaskLine): Lines {
  return withLine(lines, task.lineNumber, line => line.replace(/- \[-\]/, "- [ ]"));
}

/** Back to open: `[ ]` and no ✅ date. The dates it was planned with stay. */
export function reopenTask(lines: Lines, task: TaskLine): Lines {
  return withLine(lines, task.lineNumber, line =>
    line.replace(/- \[[xX]\]/, "- [ ]").replace(/\s*✅ \d{4}-\d{2}-\d{2}/, ""));
}

export function renameTask(lines: Lines, task: TaskLine, newDescription: string): Lines {
  return withLine(lines, task.lineNumber, line => {
    const checkboxPrefix = line.match(/^(\s*- \[[ xX-]\] )/)?.[1] ?? "";
    const fullPrefix = checkboxPrefix + (task.number ? `${task.number} | ` : "");
    const descRe = new RegExp(`(${escapeRegex(fullPrefix)})([^🛫⏳📅✅⛔🚴#\\^]+)`, "u");
    return line.replace(descRe, `$1${newDescription} `);
  });
}

export function renameGroup(lines: Lines, group: TaskGroup, newHeading: string): Lines {
  return withLine(lines, group.lineNumber, line => {
    const hm = line.match(/^(#{1,6} )/);
    return hm ? `${hm[1]}${newHeading}` : line;
  });
}

export function setProgress(lines: Lines, task: TaskLine, progress: number): Lines {
  const token = `🚴 ${Math.round(progress * 100)}%`;
  return withLine(lines, task.lineNumber, line => {
    if (/🚴 \d+%/.test(line)) return line.replace(/🚴 \d+%/, token);
    const withP = line.replace(/(\^[\w-]+\s*$)/, `${token} $1`);
    return withP.includes("🚴") ? withP : `${line.trimEnd()} ${token}`;
  });
}

/** Add `⛔ ^sourceId` to the target task. Source must already have a block id. */
export function addDependency(lines: Lines, target: TaskLine, sourceId: string): Lines {
  return withLine(lines, target.lineNumber, line => {
    if (line.includes(`⛔ ^${sourceId}`)) return line;
    const withDep = line.replace(OWN_BLOCK_RE, `⛔ ^${sourceId} $&`);
    return withDep.includes(`⛔ ^${sourceId}`) ? withDep : `${line.trimEnd()} ⛔ ^${sourceId}`;
  });
}

export function removeDependency(lines: Lines, target: TaskLine, sourceId: string): Lines {
  return withLine(lines, target.lineNumber, line =>
    line.replace(new RegExp(`\\s*⛔ \\^${escapeRegex(sourceId)}(?![\\w-])`), ""));
}

/** Append `^id` to every listed task that has none. Mutates TaskLine.id/hasBlockId. */
export function ensureBlockIds(lines: Lines, tasks: TaskLine[]): Lines {
  const missing = tasks.filter(t => !t.hasBlockId);
  if (!missing.length) return lines;
  const next = [...lines];
  for (const t of missing) {
    if (next[t.lineNumber] === undefined) continue;
    const id = newBlockId();
    next[t.lineNumber] = `${next[t.lineNumber].trimEnd()} ^${id}`;
    t.id = id;
    t.hasBlockId = true;
  }
  return next;
}

/** `⏳ start 📅 end` of a new task line; a milestone (no start) gets only 📅. */
/** `text ⏳ start 📅 end`, either date may be missing. */
function newTaskLine(text: string, startIso: string | null, endIso: string | null): string {
  return [text, startIso && `⏳ ${startIso}`, endIso && `📅 ${endIso}`].filter(Boolean).join(" ");
}

/** New task at the end of the group's own section (before the next heading). */
export function addTask(lines: Lines, groupLine: number, text: string, startIso: string | null, endIso: string | null): { lines: Lines; id: string } {
  let at = groupLine + 1;
  while (at < lines.length && !/^#{1,6} /.test(lines[at]) && !/^---/.test(lines[at])) at++;
  // keep the task glued to the list, not after trailing blank lines
  while (at > groupLine + 1 && lines[at - 1].trim() === "") at--;
  const id = newBlockId();
  const next = [...lines];
  next.splice(at, 0, `- [ ] ${newTaskLine(text, startIso, endIso)} ^${id}`);
  return { lines: next, id };
}

export function addSubtask(lines: Lines, parentLine: number, text: string, startIso: string | null, endIso: string | null): { lines: Lines; id: string } {
  const parentIndent = lines[parentLine]?.match(/^(\s*)/)?.[1] ?? "";
  let at = parentLine + 1;
  while (at < lines.length) {
    const l = lines[at];
    if (l.trim() === "") break;
    if ((l.match(/^(\s*)/)?.[1] ?? "").length <= parentIndent.length) break;
    at++;
  }
  const id = newBlockId();
  const next = [...lines];
  next.splice(at, 0, `${parentIndent}\t- [ ] ${newTaskLine(text, startIso, endIso)} ^${id}`);
  return { lines: next, id };
}

/**
 * New sub-heading at the end of the parent heading's whole section (after its
 * subgroups). If the parent's sub-sections are split by `---`, so is the new one.
 */
export function addGroup(lines: Lines, parentLine: number, text: string): Lines {
  const level = lines[parentLine]?.match(/^(#{1,6}) /)?.[1].length;
  if (!level || level >= 6) return lines;
  const headingLevel = (l: string) => l.match(/^(#{1,6}) /)?.[1].length ?? 0;
  const prevNonBlank = (i: number) => { while (i > 0 && lines[i - 1].trim() === "") i--; return i; };

  let end = parentLine + 1;
  while (end < lines.length && !(headingLevel(lines[end]) && headingLevel(lines[end]) <= level)) end++;
  let at = prevNonBlank(end);
  // the `---` right above the next heading belongs to that heading
  if (end < lines.length && at > parentLine + 1 && /^---\s*$/.test(lines[at - 1])) at = prevNonBlank(at - 1);

  let separated = false;
  for (let i = parentLine + 1; i < end; i++) {
    if (headingLevel(lines[i]) !== level + 1) continue;
    const p = prevNonBlank(i);
    separated = p > 0 && /^---\s*$/.test(lines[p - 1]);
    break;
  }
  const block = ["", ...(separated ? ["---"] : []), `${"#".repeat(level + 1)} ${text}`];
  if (at < lines.length && lines[at].trim() !== "") block.push("");
  const next = [...lines];
  next.splice(at, 0, ...block);
  return next;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Stage tags ───────────────────────────────────────────────────────────────

const STAGE_TAG_RE = /\s*#stage[\w/-]*/g;
/** First structural token after the description: a field emoji or the own ^id. */
/**
 * First structural token after the description: a field emoji or the own ^id.
 * The space before it is optional — hand-written lines like "аналитика⏳ …" exist.
 */
const TAIL_RE = /\s*(?:🔺|⏫|🔼|🔽|⏬|➕|🛫|⏳|📅|✅|🚴|⛔|\^[\w-]+\s*$)/u;

/** Insert `token` right after the description (and its tags), before the first field / own id. */
function insertAfterDescription(line: string, token: string): string {
  const m = line.match(TAIL_RE);
  if (!m || m.index === undefined) return `${line.trimEnd()} ${token}`;
  return `${line.slice(0, m.index).trimEnd()} ${token} ${line.slice(m.index).trimStart()}`;
}

/** Put `#tag` on the task (after the description) or take it off. */
export function setTag(lines: Lines, task: TaskLine, tag: string, on: boolean): Lines {
  const re = new RegExp(String.raw`\s*#${escapeRegex(tag)}(?![\w/-])`, "g");
  return withLine(lines, task.lineNumber, line => {
    const stripped = line.replace(re, "");
    return on ? insertAfterDescription(stripped, `#${tag}`) : stripped;
  });
}

/**
 * Replace the task's `#stage…` tags with `stages` (names without "#"). Other
 * tags stay where they are; new ones go right after the description, before
 * the first date/dependency field.
 */
export function setStageTags(lines: Lines, task: TaskLine, stages: string[]): Lines {
  return withLine(lines, task.lineNumber, line => {
    const stripped = line.replace(STAGE_TAG_RE, "");
    if (!stages.length) return stripped;
    return insertAfterDescription(stripped, stages.map(s => `#${s}`).join(" "));
  });
}

// ── Milestone ⇄ task ─────────────────────────────────────────────────────────

const MILESTONE_TAG_RE = /\s*#milestone(?![\w/-])/g;

/**
 * Turn a task into a milestone (`#milestone`, no ⏳/🛫, 📅 = `dateIso`) or back
 * into a regular task (no `#milestone`, ⏳ `startIso` … 📅 `endIso`).
 */
export function setMilestone(lines: Lines, task: TaskLine, on: boolean, startIso: string | null, endIso: string | null): Lines {
  const stripped = withLine(lines, task.lineNumber, line =>
    line.replace(MILESTONE_TAG_RE, "").replace(/\s*(?:⏳|🛫) \d{4}-\d{2}-\d{2}/g, ""));
  if (on) {
    const tagged = withLine(stripped, task.lineNumber, line => insertAfterDescription(line, "#milestone"));
    return endIso ? setMilestoneDate(tagged, task, endIso) : tagged;
  }
  return setTaskDates(stripped, task, startIso, endIso);
}

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Remove the task line together with its nested lines (subtasks, notes), and
 * drop `⛔ ^id` references to any removed task from the rest of the file.
 * `removedIds` = the task's own id plus its subtasks' ids.
 */
export function deleteTask(lines: Lines, task: TaskLine, removedIds: string[]): Lines {
  const first = lines[task.lineNumber];
  if (first === undefined) return lines;
  const indent = first.match(/^\s*/)![0].length;
  let end = task.lineNumber;
  while (end + 1 < lines.length && lines[end + 1].trim() !== "" && lines[end + 1].match(/^\s*/)![0].length > indent) end++;

  return stripRefs([...lines.slice(0, task.lineNumber), ...lines.slice(end + 1)], removedIds);
}

/** `⛔ ^id` for any of `ids`, with the space before it. */
function refPattern(ids: string[], flags = ""): RegExp {
  return new RegExp(`\\s*⛔ \\^(?:${ids.map(escapeRegex).join("|")})(?![\\w-])`, flags);
}

// ── Move (drag a row in the grid) ────────────────────────────────────────────

/** Where a dragged task lands, in terms of the file. */
export type Drop =
  | { mode: "before" | "after"; task: TaskLine }
  /** Last subtask of `task` — it had no subtasks to line up with. */
  | { mode: "into-task"; task: TaskLine }
  /** Last own task of the heading — before its sub-headings. */
  | { mode: "into-group"; group: TaskGroup };

const indentOf = (line: string) => line.match(/^\s*/)![0];

/**
 * Last line of the task's block: deeper-indented lines below it (subtasks,
 * notes), blank lines included when more of the block follows them.
 */
function blockEnd(lines: Lines, at: number): number {
  const indent = indentOf(lines[at]).length;
  let end = at;
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (indentOf(lines[i]).length <= indent) break;
    end = i;
  }
  return end;
}

/** End of the heading's own text, before its first sub-heading (as for a new task). */
function sectionTasksEnd(lines: Lines, groupLine: number): number {
  let at = groupLine + 1;
  while (at < lines.length && !/^#{1,6} /.test(lines[at]) && !/^---/.test(lines[at])) at++;
  while (at > groupLine + 1 && lines[at - 1].trim() === "") at--;
  return at;
}

// ── Body (the task's description, edited as markdown in the card) ──────────
//
// The description is what lies under the task line up to its first subtask:
// notes, plain points ("мысли"), links. Subtasks are tasks of their own and
// stay out of it; so does anything after the first subtask.

/** `[from, to)`: lines under the task up to its first subtask (or the end of its block). */
function bodyRange(lines: Lines, task: TaskLine): [number, number] {
  const from = task.lineNumber + 1;
  const end = blockEnd(lines, task.lineNumber) + 1;
  let to = from;
  while (to < end && !TASK_HEAD_RE.test(lines[to])) to++;
  return [from, to];
}

/**
 * Indent shared by the description lines. With none: the first subtask's
 * indent (the description lines up with it), else `\t` deeper than the task.
 */
function bodyIndent(lines: Lines, task: TaskLine): string {
  const base = indentOf(lines[task.lineNumber]);
  const [from, to] = bodyRange(lines, task);
  const indents = lines.slice(from, to).filter(l => l.trim() !== "").map(indentOf);
  if (!indents.length) {
    const sub = to <= blockEnd(lines, task.lineNumber) ? indentOf(lines[to]) : "";
    return sub.length > base.length ? sub : `${base}\t`;
  }
  let common = indents[0];
  for (const i of indents) while (!i.startsWith(common)) common = common.slice(0, -1);
  // tabs and spaces mixed: strip only the task's own indent
  return common.length > base.length ? common : base;
}

/** The task's description (up to its first subtask), without the indent it shares. */
export function taskBody(lines: Lines, task: TaskLine): string {
  if (lines[task.lineNumber] === undefined) return "";
  const indent = bodyIndent(lines, task);
  const [from, to] = bodyRange(lines, task);
  const text = lines.slice(from, to).map(l => (l.trim() === "" ? "" : l.slice(indent.length)));
  while (text.length && text[text.length - 1] === "") text.pop();
  return text.join("\n");
}

/**
 * Replace the task's description with `body`, indented back; subtasks and the
 * blank lines before them stay as they are. A line that would come out no
 * deeper than the task (typed at the left edge after a mixed-indent body)
 * still gets nested, so the description never leaks out of the task.
 */
export function setTaskBody(lines: Lines, task: TaskLine, body: string): Lines {
  if (lines[task.lineNumber] === undefined) return lines;
  const base = indentOf(lines[task.lineNumber]);
  const indent = bodyIndent(lines, task);
  const [from, to] = bodyRange(lines, task);
  const bodyLines = body.replace(/\r\n/g, "\n").split("\n");
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();
  const indented = bodyLines.map(l => {
    if (l.trim() === "") return "";
    const line = indent + l;
    return indentOf(line).length > base.length ? line : `${base}\t${l}`;
  });
  // the blank lines that separated the description from the subtasks stay
  let gap = to;
  while (gap > from && lines[gap - 1].trim() === "") gap--;
  const keep = indented.length ? lines.slice(gap, to) : [];
  return [...lines.slice(0, from), ...indented, ...keep, ...lines.slice(to)];
}

/**
 * Move the task with its whole block (subtasks, nested notes) to `drop`. The
 * block takes the indent of its new place; its inner structure is kept. A drop
 * inside the block itself is refused (lines returned unchanged).
 */
export function moveTask(lines: Lines, task: TaskLine, drop: Drop): Lines {
  if (lines[task.lineNumber] === undefined) return lines;
  const start = task.lineNumber;
  const end = blockEnd(lines, start);
  const inBlock = (n: number) => n >= start && n <= end;

  let at: number;
  let indent: string;
  if (drop.mode === "into-group") {
    at = sectionTasksEnd(lines, drop.group.lineNumber);
    indent = "";
  } else {
    const t = drop.task.lineNumber;
    if (lines[t] === undefined || inBlock(t)) return lines;
    indent = indentOf(lines[t]);
    if (drop.mode === "before") at = t;
    else if (drop.mode === "after") at = blockEnd(lines, t) + 1;
    else { at = blockEnd(lines, t) + 1; indent += "\t"; }
  }
  return moveBlock(lines, start, at, indent);
}

/** Move the block at `start` (with its nested lines) to line `at`, re-indented to `indent`. */
function moveBlock(lines: Lines, start: number, at: number, indent: string): Lines {
  const end = blockEnd(lines, start);
  if (at > start && at <= end) return lines;

  const oldIndent = indentOf(lines[start]);
  const block = lines.slice(start, end + 1).map(l => {
    if (l.trim() === "") return l;
    const cut = l.startsWith(oldIndent) ? oldIndent.length : Math.min(oldIndent.length, indentOf(l).length);
    return indent + l.slice(cut);
  });

  const rest = [...lines.slice(0, start), ...lines.slice(end + 1)];
  if (at > end) at -= block.length;
  // don't leave a double blank line where the block was
  if (at !== start && start > 0 && rest[start - 1]?.trim() === "" && rest[start]?.trim() === "") {
    rest.splice(start, 1);
    if (at > start) at--;
  }
  rest.splice(at, 0, ...block);
  return rest;
}

// ── Reorder among siblings (the ⤒ ↑ ↓ ⤓ buttons) ───────────────────────────

export type ListMove = "top" | "up" | "down" | "bottom";

/**
 * The run of tasks the task moves within: tasks at its indent, up to a
 * shallower line (the parent) or any same-level line that is not a task — a
 * heading, prose, or a plain point. Plain points belong to the parent's
 * description ("мысли" before its subtasks): a task never jumps over them.
 * Deeper lines (subtasks, notes) and blank lines belong to the tasks and are
 * skipped.
 */
function siblingTasks(lines: Lines, at: number): number[] {
  const indent = indentOf(lines[at]).length;
  const scan = (from: number, step: number): number[] => {
    const heads: number[] = [];
    for (let i = from; i >= 0 && i < lines.length; i += step) {
      const l = lines[i];
      if (l.trim() === "") continue;
      const d = indentOf(l).length;
      if (d > indent) continue;
      if (d < indent || !TASK_HEAD_RE.test(l)) break;
      heads.push(i);
    }
    return heads;
  };
  return [...scan(at - 1, -1).reverse(), at, ...scan(at + 1, 1)];
}

/**
 * Move the task within its run of sibling tasks: one step past the neighbour,
 * or to the run's edge (`top` / `bottom`). Lines come back unchanged at the edge.
 */
export function moveTaskInList(lines: Lines, task: TaskLine, move: ListMove): Lines {
  const at = task.lineNumber;
  if (lines[at] === undefined || !TASK_HEAD_RE.test(lines[at])) return lines;
  const run = siblingTasks(lines, at);
  const i = run.indexOf(at);
  const indent = indentOf(lines[at]);
  if (move === "up" || move === "top") {
    if (i === 0) return lines;
    return moveBlock(lines, at, run[move === "top" ? 0 : i - 1], indent);
  }
  if (i === run.length - 1) return lines;
  const target = run[move === "bottom" ? run.length - 1 : i + 1];
  return moveBlock(lines, at, blockEnd(lines, target) + 1, indent);
}

/** Which directions the task can move in: drives the buttons' enabled state. */
export function listMoves(lines: Lines, task: TaskLine): { up: boolean; down: boolean } {
  const at = task.lineNumber;
  if (lines[at] === undefined || !TASK_HEAD_RE.test(lines[at])) return { up: false, down: false };
  const run = siblingTasks(lines, at);
  const i = run.indexOf(at);
  return { up: i > 0, down: i < run.length - 1 };
}

/** Drop `⛔ ^id` refs to removed tasks from every line. */
function stripRefs(lines: Lines, ids: string[]): Lines {
  if (!ids.length) return lines;
  const refRe = refPattern(ids, "g");
  return lines.map(l => (l.includes("⛔") ? l.replace(refRe, "") : l));
}

/** Lines (other than the deleted subtree) that reference any of `ids` via ⛔. */
export function countDependents(lines: Lines, task: TaskLine, ids: string[]): number {
  const refRe = refPattern(ids);
  const removed = new Set(deleteRange(lines, task));
  return lines.filter((l, i) => !removed.has(i) && refRe.test(l)).length;
}

function deleteRange(lines: Lines, task: TaskLine): number[] {
  const first = lines[task.lineNumber];
  if (first === undefined) return [];
  const indent = first.match(/^\s*/)![0].length;
  const out = [task.lineNumber];
  for (let i = task.lineNumber + 1; i < lines.length && lines[i].trim() !== "" && lines[i].match(/^\s*/)![0].length > indent; i++) out.push(i);
  return out;
}

// ── Delete a group ───────────────────────────────────────────────────────────

const SEPARATOR_RE = /^---\s*$/;
const headingLevel = (line: string) => line.match(/^(#{1,6}) /)?.[1].length ?? 0;

/**
 * Lines of the heading's whole section, `[start, end)`: the heading, its text,
 * tasks and sub-headings, plus the `---` right above it. The `---` above the
 * next heading belongs to that heading and stays.
 */
export function groupRange(lines: Lines, group: TaskGroup): [number, number] {
  const at = group.lineNumber;
  const prevNonBlank = (i: number) => { while (i > 0 && lines[i - 1].trim() === "") i--; return i; };
  let start = at;
  const above = prevNonBlank(at);
  if (above > 0 && SEPARATOR_RE.test(lines[above - 1])) start = above - 1;
  let end = at + 1;
  while (end < lines.length && !(headingLevel(lines[end]) && headingLevel(lines[end]) <= group.level)) end++;
  if (end < lines.length) {
    const p = prevNonBlank(end);
    if (p - 1 > at && SEPARATOR_RE.test(lines[p - 1])) end = p - 1;
  }
  // the blank lines between sections stay once: keep the trailing ones, take the leading ones
  end = Math.max(prevNonBlank(end), at + 1);
  start = prevNonBlank(start);
  return [start, end];
}

/** Move a whole section among groups with the same parent, including its separator. */
export function moveGroupInList(lines: Lines, group: TaskGroup, siblings: TaskGroup[], move: ListMove): Lines {
  const i = siblings.findIndex(g => g.filePath === group.filePath && g.lineNumber === group.lineNumber);
  if (i < 0 || headingLevel(lines[group.lineNumber] ?? "") !== group.level) return lines;
  const targetIndex = move === "top" ? 0 : move === "bottom" ? siblings.length - 1 : i + (move === "up" ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= siblings.length || targetIndex === i) return lines;
  const [start, end] = groupRange(lines, group);
  const target = groupRange(lines, siblings[targetIndex]);
  const at = targetIndex < i ? target[0] : target[1];
  const block = lines.slice(start, end);
  const rest = [...lines.slice(0, start), ...lines.slice(end)];
  const insert = at > start ? at - block.length : at;
  return [...rest.slice(0, insert), ...block, ...rest.slice(insert)];
}

// ── Intro (the heading's text before its first task, edited in the card) ─────

/** `[start, end)` after the heading: up to the first task, embed, heading or `---`. */
function introRange(lines: Lines, group: TaskGroup): [number, number] {
  const start = group.lineNumber + 1;
  let end = start;
  while (end < lines.length && !/^\s*(?:- \[.\] |!\[\[)/.test(lines[end]) && !headingLevel(lines[end]) && !SEPARATOR_RE.test(lines[end])) end++;
  return [start, end];
}

/** The heading's text before its first task, without the blank lines around it. */
export function groupIntro(lines: Lines, group: TaskGroup): string {
  const [start, end] = introRange(lines, group);
  const text = lines.slice(start, end);
  while (text.length && text[0].trim() === "") text.shift();
  while (text.length && text[text.length - 1].trim() === "") text.pop();
  return text.join("\n");
}

/** Replace the heading's text before its first task; blank lines set it off from both sides. */
export function setGroupIntro(lines: Lines, group: TaskGroup, intro: string): Lines {
  if (headingLevel(lines[group.lineNumber] ?? "") !== group.level) return lines;
  const [start, end] = introRange(lines, group);
  const text = intro.replace(/\r\n/g, "\n").split("\n");
  while (text.length && text[0].trim() === "") text.shift();
  while (text.length && text[text.length - 1].trim() === "") text.pop();
  const after = end < lines.length ? [""] : [];
  const next = text.length ? ["", ...text, ...after] : after;
  return [...lines.slice(0, start), ...next, ...lines.slice(end)];
}

/** Drop the group's section and `⛔ ^id` refs to its tasks from the rest of the file. */
export function deleteGroup(lines: Lines, group: TaskGroup, removedIds: string[]): Lines {
  if (headingLevel(lines[group.lineNumber] ?? "") !== group.level) return lines;
  const [start, end] = groupRange(lines, group);
  return stripRefs([...lines.slice(0, start), ...lines.slice(end)], removedIds);
}

/** What deleting the group takes: text lines that are not tasks or headings, and outside refs. */
export function groupDeleteInfo(lines: Lines, group: TaskGroup, ids: string[]): { notes: number; refs: number } {
  const [start, end] = groupRange(lines, group);
  const inside = lines.slice(start, end);
  const notes = inside.filter(l => l.trim() !== "" && !SEPARATOR_RE.test(l) && !headingLevel(l) && !/^\s*- \[.\] /.test(l)).length;
  if (!ids.length) return { notes, refs: 0 };
  const refRe = refPattern(ids);
  const refs = lines.filter((l, i) => (i < start || i >= end) && refRe.test(l)).length;
  return { notes, refs };
}
