<script lang="ts">
  import { onDestroy, setContext, untrack, type Snippet } from "svelte";
  import { Gantt, Willow, Tooltip } from "@svar-ui/svelte-gantt";
  import type { IApi } from "@svar-ui/svelte-gantt";
  import { Locale } from "@svar-ui/svelte-core";
  import { ru } from "@svar-ui/core-locales";

  import { ProjectStore, StaleEditError, type Anchor, type StoreState } from "../core/store";
  import { DEFAULT_SETTINGS, type PlanRow, type TaskGroup, type TaskLine } from "../core/types";
  import { collectStageTags, filterByStageTag, ROOT_ID } from "../core/mapper";
  import { taskDepthMoves, groupDepthMoves, changeTaskDepth, changeGroupDepth } from "../core/depth";
  import * as edits from "../core/edits";
  import type { Lines } from "../core/edits";
  import { setFrontmatterKey } from "../core/frontmatter";
  import { todayIso } from "../core/taskLineEditor";
  import { basename, flatTaskLines, flatGroupTasks } from "../core/parser";
  import { toSvar, fromSvarDates, colorCss, statusCss, overdueCss, isoToDate, weekRange, addDays } from "./svarAdapter";
  import { taskTypes, scales, columns, makeHighlightTime, dayKey, allMarkers, markerLayer, projectStages, type GridLayout, MOVER_KEY, zoomCellWidth, type RowMover } from "./ganttConfig";
  import TaskDialog, { type DialogResult, type DeleteInfo, SPECIAL_TAGS } from "./TaskDialog.svelte";
  import SettingsDialog, { type SettingsResult } from "./SettingsDialog.svelte";
  import TaskTooltip from "./TaskTooltip.svelte";
  import { createToday } from "./today.svelte";
  import { navigateToToday } from "./todayNavigation";

  let { store, initialLayout = { widths: {}, gridWidth: null }, onlayoutchange, onready, toolbarStart, toolbarEnd, empty }: {
    store: ProjectStore;
    initialLayout?: GridLayout;
    onlayoutchange?: (layout: GridLayout) => void;
    onready?: (api: IApi, refreshToday: () => void) => void;
    toolbarStart?: Snippet;
    toolbarEnd?: Snippet;
    empty?: Snippet;
  } = $props();
  const today = createToday();
  const instanceId = $props.id();
  let host: HTMLDivElement;
  let hostWidth = $state(0);
  function measure(node: HTMLElement) {
    const observer = new ResizeObserver(() => { hostWidth = node.clientWidth; });
    observer.observe(node);
    hostWidth = node.clientWidth;
    return { destroy: () => observer.disconnect() };
  }
  function projectStyles(node: HTMLElement, css: string) {
    const style = node.ownerDocument.createElement("style");
    node.appendChild(style);
    const update = (value: string) => { style.textContent = value.replaceAll(".pp-gantt", `[data-planner="${instanceId}"] .pp-gantt`); };
    update(css);
    return { update, destroy: () => style.remove() };
  }
  let api = $state.raw<IApi | null>(null);

  let current = $state<StoreState | null>(null);
  let collapsed = $state(new Set<string>());
  let stage = $state("");
  let cellWidth = $state(28);
  let notice = $state("");
  let settingsOpen = $state(false);
  let settingsVersion: string | undefined;
  /** User-resized column widths and grid width — survive data refreshes and restarts. */
  let layout = $state(untrack(() => ({ ...initialLayout, widths: { ...initialLayout.widths } })));
  const gridWidth = $derived(hostWidth ? Math.min(layout.gridWidth ?? 560, Math.max(140, Math.floor(hostWidth * .65))) : undefined);
  function groupSiblings(group: TaskGroup, groups = current?.project.groups ?? []): TaskGroup[] {
    if (groups.some(g => g.filePath === group.filePath && g.lineNumber === group.lineNumber)) return groups;
    for (const parent of groups) {
      const found = groupSiblings(group, parent.subgroups);
      if (found.length) return found;
    }
    return [];
  }

  /** ⤒ ↑ ↓ ⤓ in the grid: tasks and groups move among their siblings. */
  const mover: RowMover = {
    can: row => {
      if (row.kind === "group" && row.group && row.group.filePath === current?.path) {
        const siblings = groupSiblings(row.group);
        const i = siblings.findIndex(g => g.filePath === row.group!.filePath && g.lineNumber === row.group!.lineNumber);
        return { up: i > 0, down: i >= 0 && i < siblings.length - 1, ...groupDepthMoves(current!.lines, row.group, current!.project.groups) };
      }
      const t = row.task && ownTask(row.id);
      return t && current ? { ...edits.listMoves(current.lines, t), ...taskDepthMoves(current.lines, t) } : null;
    },
    move: (row, m) => {
      if (row.kind === "group" && row.group && row.group.filePath === current?.path) {
        const group = row.group;
        const siblings = groupSiblings(group);
        void write(siblings, lines => m === "indent" || m === "outdent" ? changeGroupDepth(lines, group, current!.project.groups, m) : edits.moveGroupInList(lines, group, siblings, m));
        return;
      }
      const t = ownTask(row.id);
      if (t) void write([t], lines => m === "indent" || m === "outdent" ? changeTaskDepth(lines, t, m) : edits.moveTaskInList(lines, t, m));
    },
  };
  setContext(MOVER_KEY, mover);
  // Fixed text width enables horizontal scrolling instead of shrinking the name
  // to zero when the planner is embedded in a narrow Obsidian pane.
  const gridColumns = $derived(columns(true, { text: 260, ...layout.widths }));
  let dialog = $state<
    | { mode: "edit"; row: PlanRow; content: string }
    | { mode: "add"; parent: PlanRow; content: string }
    | null
  >(null);

  const plan = $derived(current ? (stage ? filterByStageTag(current.plan, stage) : current.plan) : null);
  const declaredStages = $derived(current?.project.frontmatter.stages?.map(String) ?? []);
  const foundStages = $derived(current ? collectStageTags(current.plan.rows) : []);
  const stages = $derived(projectStages(declaredStages, foundStages));
  /** Bumped to hand SVAR fresh data when its own state went astray (a refused row drop). */
  let resync = $state(0);
  const data = $derived.by(() => {
    void resync;
    return plan ? toSvar(plan, collapsed) : { tasks: [], links: [] };
  });
  const range = $derived(plan ? weekRange(plan) : null);
  const rowsById = $derived(new Map((current?.plan.rows ?? []).map(r => [r.id, r])));
  const depthById = $derived.by(() => {
    const depth = new Map<string, number>();
    for (const r of current?.plan.rows ?? []) depth.set(r.id, r.parent ? (depth.get(r.parent) ?? 0) + 1 : 0);
    return depth;
  });

  /** Days lit by clicking the time scale (local-midnight timestamps). */
  let highlighted = $state(new Set<number>());
  // A new function on every change is what makes SVAR repaint the cells.
  const highlightTime = $derived(makeHighlightTime(store.settings.weekendDays, highlighted));

  $effect(() => store.subscribe(s => untrack(() => {
    const changed = current?.path !== s.path;
    current = s;
    if (changed) { collapsed = new Set(); highlighted = new Set(); stage = ""; dialog = null; settingsOpen = false; }
    if (stage && !projectStages(s.project.frontmatter.stages, collectStageTags(s.plan.rows)).includes(stage)) stage = "";
  })));
  $effect(() => store.onError(error => notify(`Не удалось обновить проект: ${error}`)));

  let noticeTimer: ReturnType<typeof setTimeout>;
  onDestroy(() => clearTimeout(noticeTimer));
  function notify(text: string) {
    clearTimeout(noticeTimer);
    notice = text;
    noticeTimer = setTimeout(() => { notice = ""; }, 4000);
  }

  /** Every write goes through here: one read-modify-write, stale edits are refused. */
  async function write(anchors: Anchor[], edit: (lines: Lines) => Lines, expected = current?.content) {
    try {
      await store!.apply(anchors, edit, expected);
    } catch (e) {
      notify(e instanceof StaleEditError ? e.message : `Ошибка записи: ${e}`);
    }
  }

  /** Only tasks of the open file are editable; embedded ones live elsewhere. */
  function editableTask(id: unknown): TaskLine | null {
    const t = rowsById.get(String(id))?.task;
    return t && t.filePath === current?.path && !t.done && !t.cancelled ? t : null;
  }

  /** Any task of the open file — done ones too: only their dates are frozen, not their place. */
  function ownTask(id: unknown): TaskLine | null {
    const t = rowsById.get(String(id))?.task;
    return t && t.filePath === current?.path ? t : null;
  }

  /**
   * Where a row dropped in the grid goes in the file, read from its new place
   * in SVAR's tree: after the task above it, else before the task below it,
   * else into its parent. Neighbours that are headings don't count — a heading's
   * own tasks always come before its sub-headings in the file.
   */
  function dropFor(id: unknown): edits.Drop | null {
    const node = api?.getTask(id as string);
    const parent = node && api?.getTask(node.parent as string);
    if (!parent) return null;
    const siblings = parent.data ?? [];
    const i = siblings.findIndex(s => s.id === node.id);
    const prev = i > 0 ? ownTask(siblings[i - 1].id) : null;
    if (prev) return { mode: "after", task: prev };
    const next = i >= 0 && i + 1 < siblings.length ? ownTask(siblings[i + 1].id) : null;
    if (next) return { mode: "before", task: next };
    const row = rowsById.get(String(parent.id));
    if (row?.task) return ownTask(row.id) ? { mode: "into-task", task: row.task } : null;
    return row?.group ? { mode: "into-group", group: row.group } : null;
  }

  async function onRowDrop(id: unknown) {
    const task = ownTask(id);
    const drop = task && dropFor(id);
    if (task && drop) {
      const anchor = drop.mode === "into-group" ? drop.group : drop.task;
      await write([task, anchor], lines => edits.moveTask(lines, task, drop));
    } else {
      notify("Сюда задачу не перенести");
    }
    // a refused or no-op drop leaves SVAR's order out of sync with the file
    resync++;
  }

  // ── SVAR wiring ────────────────────────────────────────────────────────────

  function init(gantt: IApi) {
    api = gantt;
    onready?.(gantt, today.refresh);

    // Our own dialog instead of SVAR's editor.
    gantt.intercept("show-editor", ({ id }) => {
      const row = rowsById.get(String(id));
      if (row && (row.task || row.group)) dialog = { mode: "edit", row, content: current!.content };
      return false;
    });

    gantt.intercept("add-task", (ev: any) => {
      const parentId = String(ev.target ?? ev.task?.parent ?? ROOT_ID);
      const parent = rowsById.get(parentId) ?? rowsById.get(ROOT_ID);
      if (parent) dialog = { mode: "add", parent, content: current!.content };
      return false;
    });

    // Not supported — the file is the source of truth, and a stray Delete key
    // must not wipe a line.
    gantt.intercept("delete-task", () => false);

    // Rows are reordered by dragging them in the grid (that's the only source
    // with `inProgress`); SVAR moves the row live, the file is written on drop.
    gantt.intercept("move-task", (ev: any) => ev.inProgress !== undefined && !!ownTask(ev.id));
    gantt.on("move-task", (ev: any) => {
      if (ev.inProgress === false) void onRowDrop(ev.id);
    });

    // Bars: groups follow their tasks; done tasks are frozen (as in the plugin).
    // Grid rows (`top` set): any task of this file, headings stay put.
    gantt.intercept("drag-task", (ev: any) => !!(ev.top !== undefined ? ownTask(ev.id) : editableTask(ev.id)));
    gantt.intercept("update-task", ({ id }) => !!editableTask(id));

    gantt.on("update-task", (ev: any) => {
      if (ev.inProgress) return;
      const task = editableTask(ev.id);
      const row = rowsById.get(String(ev.id));
      if (!task || !row) return;
      // SVAR's payload shape differs per gesture (move, resize, progress), so
      // compare the task's resulting state with the file instead of parsing it.
      const after = gantt.getTask(ev.id);
      const dates = fromSvarDates(after, task.isMilestone);
      const datesChanged = !!dates && (dates.start !== row.start || dates.end !== row.end);
      const progress = Math.round(after.progress ?? 0);
      const progressChanged = !task.isMilestone && progress !== Math.round(row.progress * 100);
      if (!datesChanged && !progressChanged) return;
      write([task], lines => {
        let next = lines;
        if (datesChanged) {
          next = task.isMilestone
            ? edits.setMilestoneDate(next, task, dates!.end)
            : edits.setTaskDates(next, task, dates!.start, dates!.end);
        }
        if (progressChanged) next = edits.setProgress(next, task, progress / 100);
        return next;
      });
    });

    // ⛔ is finish-to-start only, so every drawn link becomes e2s.
    gantt.intercept("add-link", (ev: any) => {
      const ok = !!editableTask(ev.link.target) && !!rowsById.get(String(ev.link.source))?.task;
      if (ok) ev.link.type = "e2s";
      return ok;
    });
    gantt.on("add-link", (ev: any) => {
      const target = editableTask(ev.link.target);
      const source = rowsById.get(String(ev.link.source))?.task;
      if (target && source) write([target], lines => edits.addDependency(lines, target, source.id));
    });
    gantt.on("delete-link", (ev: any) => {
      const link = current?.plan.links.find(l => l.id === ev.id);
      const target = link && editableTask(link.target);
      if (link && target) write([target], lines => edits.removeDependency(lines, target, link.source));
    });

    // Remember resized columns / splitter (see columns() for why).
    gantt.on("set-columns", ({ columns: cols }: any) => {
      const widths = { ...layout.widths };
      for (const c of cols ?? []) if (c.id !== "add-task" && c.width) widths[c.id] = Math.round(c.width);
      layout = { ...layout, widths };
      onlayoutchange?.(layout);
    });
    gantt.on("resize-grid", ({ width, inProgress }: any) => {
      if (inProgress || !width) return;
      layout = { ...layout, gridWidth: Math.round(width) };
      onlayoutchange?.(layout);
    });

    gantt.on("open-task", ({ id, mode }) => {
      const next = new Set(collapsed);
      if (mode) next.delete(String(id)); else next.add(String(id));
      collapsed = next;
    });
  }

  // ── Toolbar actions ────────────────────────────────────────────────────────

  /** ±N: fold/unfold every row at depth N (root is depth 0). */
  function toggleLevel(level: number) {
    stage = "";
    const atLevel = data.tasks.filter(t => depthById.get(String(t.id)) === level && t.open !== undefined);
    if (!atLevel.length) return;
    const anyOpen = atLevel.some(t => !collapsed.has(String(t.id)));
    const next = new Set(collapsed);
    for (const t of atLevel) anyOpen ? next.add(String(t.id)) : next.delete(String(t.id));
    collapsed = next;
  }

  function zoom(delta: number) {
    cellWidth = zoomCellWidth(api, cellWidth, delta);
  }

  function scrollToToday() {
    navigateToToday(api, range, todayIso(), notify);
  }

  async function saveSettings(result: SettingsResult) {
    settingsOpen = false;
    if (settingsVersion !== current?.content) { notify(new StaleEditError().message); return; }
    const oldMarkers = current?.project.frontmatter.markers ?? [];
    const stagesChanged = JSON.stringify(result.stages) !== JSON.stringify(declaredStages);
    const markersChanged = JSON.stringify(result.markers) !== JSON.stringify(
      oldMarkers.map(m => ({ date: String(m.date), label: m.label ?? "", color: m.color ?? "red" }))
    );
    if (!stagesChanged && !markersChanged) return;
    await write([], lines => {
      let next = lines;
      if (stagesChanged) next = setFrontmatterKey(next, "stages", result.stages.length ? result.stages : undefined);
      if (markersChanged) next = setFrontmatterKey(next, "markers", result.markers.length ? result.markers : undefined);
      return next;
    });
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  /** Ids removed with the task (its whole subtree). */
  function subtreeIds(task: TaskLine): string[] {
    return flatTaskLines(task).map(t => t.id);
  }

  /** Tasks of this file under the group; embedded ones only lose their `![[…]]` line. */
  function groupTasks(group: TaskGroup): TaskLine[] {
    return flatGroupTasks(group).filter(t => t.filePath === current?.path);
  }

  /** What deleting `row` would take with it; null when it can't be deleted from here. */
  function deleteInfo(row: PlanRow): DeleteInfo | null {
    if (row.kind === "group" && row.group && current) {
      const group = row.group;
      const tasks = groupTasks(group);
      const countSubgroups = (g: TaskGroup): number => g.subgroups.reduce((n, sub) => n + 1 + countSubgroups(sub), 0);
      const { notes, refs } = edits.groupDeleteInfo(current.lines, group, tasks.map(t => t.id));
      return { subtasks: tasks.length, refs, subgroups: countSubgroups(group), notes };
    }
    const task = row.task;
    if (!task || task.filePath !== current?.path) return null;
    return { subtasks: flatTaskLines(task).length - 1, refs: edits.countDependents(current.lines, task, subtreeIds(task)) };
  }

  /** Markdown for the card's editor: text under a task, or a heading's text before its first task. */
  function cardText(row: PlanRow): string | null {
    if (!current) return null;
    if (row.task) return row.task.filePath === current.path ? edits.taskBody(current.lines, row.task) : null;
    return row.group ? edits.groupIntro(current.lines, row.group) : null;
  }

  /** `[ ]` ⇄ `[-]` from the card's "Отменить" / "Вернуть". */
  async function setCancelled(row: PlanRow) {
    const expected = dialog?.content;
    dialog = null;
    const task = row.task!;
    await write([task], lines => (task.cancelled ? edits.restoreTask(lines, task) : edits.cancelTask(lines, task)), expected);
  }

  async function deleteTask(row: PlanRow) {
    const expected = dialog?.content;
    dialog = null;
    if (row.kind === "group") {
      const group = row.group!;
      const ids = groupTasks(group).map(t => t.id);
      await write([group], lines => edits.deleteGroup(lines, group, ids), expected);
      return;
    }
    const task = row.task!;
    const ids = subtreeIds(task);
    await write([task], lines => edits.deleteTask(lines, task, ids), expected);
  }

  // ── Time scale click → highlight a day / week / month ─────────────────────

  /** Every day covered by the clicked scale unit. */
  function daysForUnit(unit: string, date: Date): Date[] {
    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (unit === "week") {
      const monday = addDays(base, -((base.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_v, i) => addDays(monday, i));
    }
    if (unit === "month") {
      const days: Date[] = [];
      for (let d = new Date(base.getFullYear(), base.getMonth(), 1); d.getMonth() === base.getMonth(); d = addDays(d, 1)) days.push(d);
      return days;
    }
    return [base];
  }

  /**
   * SVAR scale cells carry no date, so the date comes from the click position
   * and the unit from which scale row was hit.
   */
  function onScaleClick(e: MouseEvent) {
    const cell = (e.target as HTMLElement).closest(".wx-scale .wx-cell");
    const scaleEl = cell?.closest(".wx-scale");
    const s = (api?.getState() as any)?._scales;
    if (!cell || !scaleEl || !s?.start) return;
    const rowIndex = [...scaleEl.querySelectorAll(":scope > .wx-row")].indexOf(cell.parentElement!);
    const unit = scales[rowIndex]?.unit;
    if (!unit) return;
    const x = e.clientX - scaleEl.getBoundingClientRect().left;
    const date = addDays(s.start, Math.floor(x / s.lengthUnitWidth));
    const keys = daysForUnit(unit, date).map(dayKey);
    const allOn = keys.every(k => highlighted.has(k));
    const next = new Set(highlighted);
    for (const k of keys) allOn ? next.delete(k) : next.add(k);
    highlighted = next;
  }

  // ── Task dialog ────────────────────────────────────────────────────────────

  async function onDialogSave(result: DialogResult) {
    const d = dialog;
    dialog = null;
    if (!d) return;
    if (d.content !== current?.content) { notify(new StaleEditError().message); return; }
    const tags = [...result.special, ...result.stages].map(s => ` #${s}`).join("");
    if (d.mode === "add") {
      const parent = d.parent;
      if (result.group) {
        if (parent.group) await write([parent.group], lines => edits.addGroup(lines, parent.group!.lineNumber, result.text));
        return;
      }
      const text = result.text + (result.milestone ? " #milestone" : "") + tags;
      // a milestone has no start: the line gets 📅 only
      const start = result.milestone ? null : result.start;
      if (parent.task) {
        await write([parent.task], lines => edits.addSubtask(lines, parent.task!.lineNumber, text, start, result.end).lines);
      } else if (parent.group) {
        await write([parent.group], lines => edits.addTask(lines, parent.group!.lineNumber, text, start, result.end).lines);
      } else {
        notify("В файле нет заголовка # — некуда добавить задачу");
      }
      return;
    }
    const { row } = d;
    const bodyChanged = result.body !== null && result.body !== cardText(row);
    if (row.group) {
      const group = row.group;
      await write([group], lines => {
        // the text sits below the heading, so the heading's line number stays valid
        const next = bodyChanged ? edits.setGroupIntro(lines, group, result.body!) : lines;
        return result.text !== group.heading ? edits.renameGroup(next, group, result.text) : next;
      });
      return;
    }
    const task = row.task!;
    const ownStages = task.tags.filter(t => t.startsWith("stage"));
    const stagesChanged = ownStages.join(" ") !== result.stages.join(" ");
    const kindChanged = result.milestone !== task.isMilestone;
    await write([task], lines => {
      // only the lines under the task change, so the task's line number stays valid
      let next = bodyChanged ? edits.setTaskBody(lines, task, result.body!) : lines;
      if (result.text !== task.description) next = edits.renameTask(next, task, result.text);
      if (stagesChanged) next = edits.setStageTags(next, task, result.stages);
      for (const tag of SPECIAL_TAGS) {
        const on = result.special.includes(tag);
        if (on !== task.tags.includes(tag)) next = edits.setTag(next, task, tag, on);
      }
      if (kindChanged) {
        // task ⇄ milestone also rewrites the dates (milestone: 📅 only)
        next = edits.setMilestone(next, task, result.milestone, result.start, result.end);
      } else if (task.isMilestone) {
        if (result.end && result.end !== task.dueDate) next = edits.setMilestoneDate(next, task, result.end);
      } else if (result.start !== (task.startDate ?? task.scheduledDate) || result.end !== task.dueDate) {
        // own dates only; clearing one removes it from the line
        next = edits.setTaskDates(next, task, result.start, result.end);
      }
      if (!result.milestone && !kindChanged && result.progress !== Math.round(row.progress * 100) && !task.done) {
        next = edits.setProgress(next, task, result.progress / 100);
      }
      if (result.done && !task.done) next = edits.closeTask(next, task);
      if (!result.done && task.done) next = edits.reopenTask(next, task);
      return next;
    });
  }
</script>

<div class="pp-scope pp-app" data-planner={instanceId} bind:this={host}
  use:measure
  use:projectStyles={`${colorCss(current?.project.frontmatter.colors)}\n${statusCss(current?.plan, current?.project.frontmatter.colors)}\n${overdueCss(current?.plan, today.iso)}`}>
  <header class="pp-toolbar">
    {@render toolbarStart?.()}
    <span class="pp-title" title={current?.path}>{current?.plan.title ?? "Нет открытого проекта"}</span>

    {#if stages.length}
      <select bind:value={stage}>
        <option value="">Все этапы</option>
        {#each stages as s (s)}<option value={s}>#{s}</option>{/each}
      </select>
    {/if}

    {#each [1, 2, 3, 4, 5] as lvl (lvl)}
      <button class="pp-level" title="Свернуть/развернуть уровень {lvl}" onclick={() => toggleLevel(lvl)}>±{lvl}</button>
    {/each}

    <button title="Уже дни" onclick={() => zoom(-4)}>−</button>
    <button title="Шире дни" onclick={() => zoom(+4)}>+</button>
    <button onclick={scrollToToday}>Сегодня</button>
    <button
      class="pp-primary"
      disabled={!current}
      onclick={() => { const root = rowsById.get(ROOT_ID); if (root) dialog = { mode: "add", parent: root, content: current!.content }; }}
    >+ Задача</button>

    <span class="pp-spacer"></span>
    {@render toolbarEnd?.()}
    <button disabled={!current} title="Настройки проекта" onclick={() => { settingsVersion = current?.content; settingsOpen = true; }}>⚙</button>
  </header>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <main class="pp-gantt" use:markerLayer={{ api: () => api, markers: () => allMarkers(plan?.markers ?? [], today.iso), today: today.iso }} onclick={onScaleClick}>
    {#if current}
      <Locale words={ru}>
        <Willow fonts={false}>
          <Tooltip api={api ?? undefined} content={TaskTooltip}>
            <Gantt
              {init}
              tasks={data.tasks}
              links={data.links}
              {scales}
              columns={gridColumns}
              {gridWidth}
              {taskTypes}
              {cellWidth}
              {highlightTime}
              autoScale={false}
              start={range?.start}
              end={range?.end}
              cellHeight={30}
              scaleHeight={22}
            />
          </Tooltip>
        </Willow>
      </Locale>
    {:else}
      <div class="pp-empty">
        {#if empty}{@render empty()}{:else}<p>Нет открытого проекта.</p>{/if}
      </div>
    {/if}
  </main>

  {#if notice}<div class="pp-notice" role="status">{notice}</div>{/if}

{#if dialog}
  <TaskDialog
    mode={dialog.mode}
    row={dialog.mode === "edit" ? dialog.row : null}
    canAddGroup={dialog.mode === "add" && !dialog.parent.task && (dialog.parent.group?.level ?? 6) < 6}
    {stages}
    deleteInfo={dialog.mode === "edit" ? deleteInfo(dialog.row) : null}
    body={dialog.mode === "edit" ? cardText(dialog.row) : null}
    ondelete={() => dialog?.mode === "edit" && deleteTask(dialog.row)}
    oncancelTask={() => dialog?.mode === "edit" && setCancelled(dialog.row)}
    onsave={onDialogSave}
    oncancel={() => (dialog = null)}
  />
{/if}

{#if settingsOpen}
  <SettingsDialog
    stages={declaredStages}
    found={foundStages}
    markers={current?.project.frontmatter.markers ?? []}
    onsave={saveSettings}
    oncancel={() => (settingsOpen = false)}
  />
{/if}

</div>
