import { parse as parseYaml } from "yaml";
import type {
  TaskLine, TaskGroup, ParsedProject, ProjectFrontmatter, PlannerSettings, Dependency,
} from "./types";

// Порт FileScanner из плагина. Разница одна: вместо Obsidian vault парсер
// получает текст файла, а встраивания `![[file]]` разрешает через колбэк —
// так ядро не зависит от того, где лежат файлы (Tauri fs, браузер, тесты).

/** Returns the embedded file's path + content, or null if it can't be resolved. */
export type EmbedResolver = (
  linkName: string,
  fromPath: string
) => Promise<{ path: string; content: string } | null>;

const TASK_RE = /^(\s*)- \[( |x|X|-)\] (.+)$/;
const PROGRESS_RE       = /🚴 (\d+)%/;
const SCHEDULED_DATE_RE = /⏳ (\d{4}-\d{2}-\d{2})/;
const START_DATE_RE     = /🛫 (\d{4}-\d{2}-\d{2})/;
const DUE_DATE_RE       = /📅 (\d{4}-\d{2}-\d{2})/;
const DONE_DATE_RE      = /✅ (\d{4}-\d{2}-\d{2})/;
const BLOCK_ID_RE       = /\^([\w-]+)$/;
const DEPENDS_LOCAL_RE  = /⛔ \^([\w-]+)/g;
const DEPENDS_REMOTE_RE = /⛔ \[\[([^\]#]+)#\^([\w-]+)\]\]/g;
const TASK_NUM_RE_DOT   = /^(\d+(?:\.\d+)*) \| /;
const TASK_NUM_RE_DASH  = /^(\d+(?:-\d+)*) \| /;
const TAG_RE            = /#([\w/-]+)/g;
const HEADING_RE        = /^(#{1,6}) (.+)$/;
const EMBED_RE          = /^!\[\[(.+?)(?:#[^\]]+)?\]\]/;

export function basename(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  return name.replace(/\.md$/i, "");
}

export function splitLines(content: string): string[] {
  return content.split("\n");
}

export function parseFrontmatter(lines: string[]): { frontmatter: ProjectFrontmatter; bodyStart: number } {
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, bodyStart: 0 };
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (endIdx <= 0) return { frontmatter: {}, bodyStart: 0 };

  let frontmatter: ProjectFrontmatter = {};
  try { frontmatter = (parseYaml(lines.slice(1, endIdx).join("\n")) ?? {}) as ProjectFrontmatter; } catch { /* broken yaml = no settings */ }
  return { frontmatter, bodyStart: endIdx + 1 };
}

export async function parseProject(
  content: string,
  filePath: string,
  settings: PlannerSettings,
  resolveEmbed?: EmbedResolver
): Promise<ParsedProject> {
  // CRLF-файлы: \r в конце строки ломает якорные regex'ы ($).
  const lines = splitLines(content.replace(/\r\n/g, "\n"));
  const { frontmatter, bodyStart } = parseFrontmatter(lines);

  let title = basename(filePath);
  for (let i = bodyStart; i < lines.length; i++) {
    const m = lines[i].match(/^# (.+)$/);
    if (m) { title = m[1].trim(); break; }
  }

  const groups = await parseGroups(lines, bodyStart, filePath, settings, resolveEmbed);
  return { title, frontmatter, groups, filePath };
}

async function parseGroups(
  lines: string[],
  start: number,
  filePath: string,
  settings: PlannerSettings,
  resolveEmbed?: EmbedResolver
): Promise<TaskGroup[]> {
  const roots: TaskGroup[] = [];
  const stack: TaskGroup[] = [];
  const taskStack: { indent: number; task: TaskLine }[] = [];
  // The first H1 is the project root node. A second one is broken data:
  // parsing stops there, so it and everything below it is dropped.
  let h1Seen = false;

  const currentGroup = (): TaskGroup | null => (stack.length ? stack[stack.length - 1] : null);

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    const hm = line.match(HEADING_RE);
    if (hm) {
      const level = hm[1].length;
      if (level === 1) {
        if (h1Seen) break;
        h1Seen = true;
      }
      const headingText = hm[2].trim();
      const numMatch = headingText.match(/^(\d[\d.]*)\. /);
      const group: TaskGroup = {
        heading: headingText,
        level,
        number: numMatch ? numMatch[1] : "",
        tasks: [],
        subgroups: [],
        filePath,
        lineNumber: i,
        hasContent: false,
      };
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      if (stack.length === 0) roots.push(group);
      else stack[stack.length - 1].subgroups.push(group);
      stack.push(group);
      taskStack.length = 0;
      continue;
    }

    if (currentGroup() && line.trim() !== "" && !/^---\s*$/.test(line)) currentGroup()!.hasContent = true;

    const em = line.match(EMBED_RE);
    if (em && currentGroup()) {
      const embedded = resolveEmbed ? await resolveEmbed(em[1].trim(), filePath) : null;
      if (embedded) {
        const firstLine = splitLines(embedded.content.replace(/\r\n/g, "\n"))[0];
        const task = parseTaskLine(firstLine, 0, embedded.path, settings);
        if (task) currentGroup()!.tasks.push(task);
      }
      continue;
    }

    const tm = line.match(TASK_RE);
    if (tm && currentGroup()) {
      const task = parseTaskLine(line, i, filePath, settings);
      if (!task) continue;
      const indent = tm[1].length;
      while (taskStack.length && taskStack[taskStack.length - 1].indent >= indent) taskStack.pop();
      if (taskStack.length === 0) currentGroup()!.tasks.push(task);
      else taskStack[taskStack.length - 1].task.subtasks.push(task);
      taskStack.push({ indent, task });
    }
  }

  return roots;
}

export function parseTaskLine(
  raw: string,
  lineNumber: number,
  filePath: string,
  settings: PlannerSettings
): TaskLine | null {
  const tm = raw.match(TASK_RE);
  if (!tm) return null;

  const done = tm[2].toLowerCase() === "x";
  const cancelled = tm[2] === "-";
  let text = tm[3];

  const blockMatch = text.match(BLOCK_ID_RE);
  const hasBlockId = blockMatch !== null;
  const id = hasBlockId ? blockMatch![1] : `task-${lineNumber}`;
  text = text.replace(BLOCK_ID_RE, "").trim();

  const dependsOn: Dependency[] = [];
  // remote first (before local, so they don't partially match)
  for (const rm of text.matchAll(new RegExp(DEPENDS_REMOTE_RE.source, "g"))) {
    dependsOn.push({ type: "remote", file: rm[1].trim(), id: rm[2] });
  }
  text = text.replace(/⛔ \[\[[^\]]+\]\]/g, "").trim();
  for (const dm of text.matchAll(new RegExp(DEPENDS_LOCAL_RE.source, "g"))) {
    dependsOn.push({ type: "local", id: dm[1] });
  }
  text = text.replace(/⛔ \^[\w-]+/g, "").trim();

  const progressMatch = text.match(PROGRESS_RE);
  const progress = progressMatch ? parseInt(progressMatch[1]) / 100 : null;
  text = text.replace(PROGRESS_RE, "").trim();

  const scheduledDate  = text.match(SCHEDULED_DATE_RE)?.[1] ?? null;
  const startDate      = text.match(START_DATE_RE)?.[1] ?? null;
  const dueDate        = text.match(DUE_DATE_RE)?.[1] ?? null;
  const completionDate = text.match(DONE_DATE_RE)?.[1] ?? null;
  text = text
    .replace(SCHEDULED_DATE_RE, "")
    .replace(START_DATE_RE, "")
    .replace(DUE_DATE_RE, "")
    .replace(DONE_DATE_RE, "")
    .trim();

  const isMilestone = text.includes("#milestone");
  const isCritical  = text.includes("#critical");
  const tags = [...text.matchAll(new RegExp(TAG_RE.source, "g"))].map(m => m[1]);
  text = text.replace(/#[\w/-]+/g, "").trim();

  const numRe = settings.numberFormat === "dot" ? TASK_NUM_RE_DOT : TASK_NUM_RE_DASH;
  const numMatch = text.match(numRe);
  const number = numMatch ? numMatch[1] : "";
  const description = text.replace(numRe, "").trim();

  return {
    raw, lineNumber, filePath, id, hasBlockId, number, description, done, cancelled, progress,
    scheduledDate, startDate, dueDate, completionDate, dependsOn, isMilestone, isCritical,
    tags, subtasks: [],
  };
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

export function flatTaskLines(task: TaskLine): TaskLine[] {
  return [task, ...task.subtasks.flatMap(flatTaskLines)];
}

export function flatGroupTasks(group: TaskGroup): TaskLine[] {
  return [...group.tasks.flatMap(flatTaskLines), ...group.subgroups.flatMap(flatGroupTasks)];
}

export function allTasks(project: ParsedProject): TaskLine[] {
  return project.groups.flatMap(flatGroupTasks);
}
