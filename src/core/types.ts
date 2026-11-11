// ─── Domain model of a project file ──────────────────────────────────────────
// Перенесено из obsidian-gantt-planner-plugin/src/types.ts без изменений
// семантики. Ничего не знает ни об Obsidian, ни о библиотеке диаграммы.

export type Dependency =
  | { type: "local"; id: string }
  | { type: "remote"; file: string; id: string };

export interface TaskLine {
  /** Raw markdown line */
  raw: string;
  /** Line number in file (0-based) */
  lineNumber: number;
  /** Source file path */
  filePath: string;

  id: string;           // block reference ^task-id
  hasBlockId: boolean;  // true if ^id was present in the file (not generated)
  number: string;       // "1.1" or "1-1"
  description: string;
  done: boolean;
  cancelled: boolean;            // - [-]
  progress: number | null;       // 🚴 N% → 0..1
  scheduledDate: string | null;  // ⏳
  startDate: string | null;      // 🛫
  dueDate: string | null;        // 📅
  completionDate: string | null; // ✅
  dependsOn: Dependency[];       // ⛔
  isMilestone: boolean;          // #milestone
  isCritical: boolean;           // #critical
  tags: string[];
  subtasks: TaskLine[];          // indented child tasks
}

export interface TaskGroup {
  heading: string;
  level: number;        // # = 1, ## = 2 …
  number: string;
  tasks: TaskLine[];
  subgroups: TaskGroup[];
  filePath: string;
  lineNumber: number;
  /** The heading's own section has text other than blank lines and `---`. */
  hasContent: boolean;
}

export interface ProjectMarker {
  date: string;
  label: string;
  color: string;
}

export interface ProjectColors {
  todo?: string;
  "in-progress"?: string;
  done?: string;
  cancelled?: string;
  blocked?: string;
  milestone?: string;
  critical?: string;
  group?: string;
}

export interface ProjectFrontmatter {
  id?: string;
  /** Stage tags offered in the task card, without "#": ["stage1", "stage2"] */
  stages?: string[];
  colors?: ProjectColors;
  markers?: ProjectMarker[];
  /** Full path of the HTML file the project was last exported to. */
  "export-html"?: string;
}

export interface ParsedProject {
  title: string;
  frontmatter: ProjectFrontmatter;
  groups: TaskGroup[];
  filePath: string;
}

export type NumberFormat = "dot" | "dash";

export interface PlannerSettings {
  numberFormat: NumberFormat;
  /** Day-of-week indices to highlight as weekends (0=Sun … 6=Sat) */
  weekendDays: number[];
}

export const DEFAULT_SETTINGS: PlannerSettings = {
  numberFormat: "dot",
  weekendDays: [0, 6],
};

// ─── View model ──────────────────────────────────────────────────────────────
// Нейтральная модель строки диаграммы. Даты — ISO, `end` ВКЛЮЧИТЕЛЬНЫЙ
// (как 📅 в файле). Переводом в формат конкретной библиотеки (SVAR и т.п.)
// занимается адаптер в ui/, так что смена рисовалки не трогает ядро.

export type RowKind = "root" | "group" | "task" | "milestone";

export interface PlanRow {
  id: string;
  parent: string | null;
  kind: RowKind;
  text: string;
  start: string;   // ISO, inclusive
  end: string;     // ISO, inclusive
  progress: number; // 0..1
  color?: string;
  done: boolean;
  /** `- [-]`: still drawn, greyed out; left out of progress and overdue. */
  cancelled?: boolean;
  critical: boolean;
  task?: TaskLine;
  group?: TaskGroup;
  /** Markdown from the card: text under the task line / a heading's text before its first task. */
  notes?: string;
}

export interface PlanLink {
  id: string;
  source: string;
  target: string;
  external: boolean;
}

export interface Plan {
  title: string;
  rows: PlanRow[];
  links: PlanLink[];
  markers: ProjectMarker[];
}
