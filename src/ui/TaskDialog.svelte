<script lang="ts" module>
  export interface DialogResult {
    text: string;
    /** The task's own dates; null = none (the span then comes from its subtasks) */
    start: string | null;
    end: string | null;
    progress: number; // 0..100
    done: boolean;
    /** Stage tags without "#" */
    stages: string[];
    /** The task is (or becomes) a #milestone: no start date, only the due date */
    milestone: boolean;
    /** Special status tags that are on, without "#" (subset of SPECIAL_TAGS) */
    special: string[];
    /** Add mode: create a sub-heading named `text` instead of a task */
    group: boolean;
    /** Edited text under the task line (subtasks, notes); null = not shown */
    body: string | null;
  }

  /** What a delete would take with it. A group also takes its sub-headings and text. */
  export interface DeleteInfo {
    /** Task: its subtasks. Group: every task of the file under it. */
    subtasks: number;
    /** Lines outside that lose a ⛔ ref */
    refs: number;
    subgroups?: number;
    /** Group: text lines that are not tasks or headings */
    notes?: number;
  }

  /** Status tags with their own checkbox; they also drive the bar colour. */
  export const SPECIAL_TAGS = ["in-progress", "blocked", "critical"] as const;
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { dialogKeys } from "./dialogKeys";
  import type { PlanRow } from "../core/types";
  import DateField from "./DateField.svelte";
  import MarkdownField from "./MarkdownField.svelte";

  let { mode, row, stages, canAddGroup = false, deleteInfo = null, body: initialBody = null, onsave, oncancel, ondelete, oncancelTask }: {
    mode: "edit" | "add";
    row: PlanRow | null;
    /** Add mode: the parent is a heading, so a sub-heading can be added under it */
    canAddGroup?: boolean;
    /** Stages offered as checkboxes (project settings + tags found in the file) */
    stages: string[];
    /** What a delete would take with it; null = the task can't be deleted here */
    deleteInfo?: DeleteInfo | null;
    /** Task: text under its line, without the indent. Group: text before its first task. null = no editor */
    body?: string | null;
    onsave: (r: DialogResult) => void;
    oncancel: () => void;
    ondelete?: () => void;
    /** Task: `[ ]` → `[-]`, or back when it is cancelled. Same rule as delete: tasks of the open file. */
    oncancelTask?: () => void;
  } = $props();

  // Snapshot the row once: the dialog edits a copy, the file is written on Save.
  const initial = untrack(() => row);
  /** Add mode toggle: new group (a heading, only its title) instead of a task */
  let asGroup = $state(false);
  const isGroup = $derived((!!initial?.group && !initial?.task) || asGroup);
  const isMilestone = initial?.kind === "milestone";
  const ownStages = initial?.task?.tags.filter(t => t.startsWith("stage")) ?? [];

  let text = $state(initial ? (initial.task?.description ?? initial.text) : "");
  // The task's own dates, not the row's span: a task without them takes its
  // period from its subtasks, and saving must not pin that computed span.
  let start = $state(initial?.task?.startDate ?? initial?.task?.scheduledDate ?? "");
  let end = $state(initial?.task?.dueDate ?? "");
  let progress = $state(Math.round((initial?.progress ?? 0) * 100));
  let done = $state(initial?.done ?? false);
  let picked = $state(new Set(ownStages));
  let specialOn = $state(new Set<string>(SPECIAL_TAGS.filter(t => initial?.task?.tags.includes(t))));
  /** "#milestone" checkbox: no start date, only the due date. */
  let milestoneFlag = $state(isMilestone);
  const asMilestone = $derived(milestoneFlag);
  let confirmingDelete = $state(false);
  let body = $state(untrack(() => initialBody));

  // A tag the task carries but settings don't list is still shown, so saving
  // never drops it silently.
  const offered = $derived([...untrack(() => stages), ...ownStages.filter(s => !untrack(() => stages).includes(s))]);
  // dates are optional; a milestone needs its date, and a set pair must be in order
  const valid = $derived(text.trim() !== "" && (isGroup || (asMilestone ? end !== "" : !(start && end && end < start))));

  function toggle(s: string) {
    const next = new Set(picked);
    if (next.has(s)) next.delete(s); else next.add(s);
    picked = next;
  }

  function submit(e: Event) {
    e.preventDefault();
    if (!valid) return;
    onsave({
      text: text.trim(),
      start: asMilestone || !start ? null : start,
      end: end || null,
      progress,
      done,
      stages: offered.filter(s => picked.has(s)),
      milestone: milestoneFlag,
      special: SPECIAL_TAGS.filter(t => specialOn.has(t)),
      group: asGroup,
      body,
    });
  }

  function focus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<div class="pp-backdrop" role="presentation" onclick={oncancel}></div>
<form class="pp-dialog" onsubmit={submit} use:dialogKeys={e => { if (e.key !== "Escape") return; if (confirmingDelete) confirmingDelete = false; else oncancel(); }}>
  <h3>{mode === "add" ? (asGroup ? "Новая группа" : "Новая задача") : isGroup ? "Группа" : "Задача"}</h3>

  {#if mode === "add" && canAddGroup}
    <div class="pp-kind">
      <span class:pp-off={asGroup}>Задача</span>
      <button
        type="button"
        role="switch"
        aria-checked={asGroup}
        aria-label="Группа"
        class="pp-switch"
        class:pp-on={asGroup}
        onclick={() => (asGroup = !asGroup)}
      ><span></span></button>
      <span class:pp-off={!asGroup}>Группа</span>
    </div>
  {/if}

  <label>
    {isGroup ? "Заголовок" : "Описание"}
    <input bind:value={text} use:focus />
  </label>

  {#if !isGroup}
    <label class="pp-check"><input type="checkbox" bind:checked={milestoneFlag} /> #milestone <span class="pp-dim">— веха: без даты старта, только дата</span></label>
    <div class="pp-row">
      {#if !asMilestone}
        <label>Старт <DateField bind:value={start} clearable /></label>
      {/if}
      <label>{asMilestone ? "Дата" : "Финиш"} <DateField bind:value={end} clearable={!asMilestone} invalid={asMilestone && !end} /></label>
    </div>

    <div class="pp-stages">
      <span>Статус</span>
      {#each SPECIAL_TAGS as t (t)}
        <label class="pp-check">
          <input
            type="checkbox"
            checked={specialOn.has(t)}
            onchange={() => { const n = new Set(specialOn); if (n.has(t)) n.delete(t); else n.add(t); specialOn = n; }}
          /> #{t}
        </label>
      {/each}
    </div>

    {#if offered.length}
      <div class="pp-stages">
        <span>Этапы</span>
        {#each offered as s (s)}
          <label class="pp-check"><input type="checkbox" checked={picked.has(s)} onchange={() => toggle(s)} /> #{s}</label>
        {/each}
      </div>
    {/if}

    {#if mode === "edit" && !initial?.done && !initial?.task?.cancelled && !asMilestone}
      <label>Прогресс: {progress}% <input type="range" min="0" max="100" step="5" bind:value={progress} /></label>
    {/if}
    {#if mode === "edit" && !initial?.task?.cancelled}
      <label class="pp-check"><input type="checkbox" bind:checked={done} /> Выполнена {initial?.done ? `(✅ ${initial.task?.completionDate ?? ""})` : "(✅ сегодня)"}</label>
    {/if}
  {/if}

  {#if initial?.task}
    <code class="pp-raw" title="Строка {initial.task.lineNumber + 1}">{initial.task.raw.trim()}</code>
  {/if}

  {#if body !== null}
    <MarkdownField bind:value={body} hint={isGroup ? "Текст раздела до первой задачи (markdown)" : "Заметки и подзадачи под строкой задачи (markdown)"} />
  {/if}

  <div class="pp-buttons">
    {#if mode === "edit" && deleteInfo && ondelete}
      <button type="button" class="pp-danger-outline" onclick={() => (confirmingDelete = true)}>Удалить…</button>
      {#if initial?.task && !initial.done && oncancelTask}
        <button type="button" onclick={oncancelTask}>{initial.task.cancelled ? "Вернуть" : "Отменить"}</button>
      {/if}
      <span class="pp-spacer"></span>
    {/if}
    <button type="button" onclick={oncancel}>Отмена</button>
    <button type="submit" class="pp-primary" disabled={!valid}>{mode === "add" ? "Добавить" : "Сохранить"}</button>
  </div>
</form>

{#if confirmingDelete && deleteInfo && initial && isGroup}
  <div class="pp-backdrop pp-backdrop-top" role="presentation" onclick={() => (confirmingDelete = false)}></div>
  <div class="pp-dialog pp-confirm" role="alertdialog">
    <h3>Удалить группу?</h3>
    <p>Заголовок «{initial.text}» будет удалён из файла вместе со всем своим разделом.</p>
    {#if deleteInfo.subtasks}
      <p>Удалятся задачи (с подзадачами): {deleteInfo.subtasks}.</p>
    {/if}
    {#if deleteInfo.subgroups}
      <p>Удалятся подгруппы: {deleteInfo.subgroups}.</p>
    {/if}
    {#if deleteInfo.notes}
      <p>Удалятся строки текста (заметки, ссылки, картинки): {deleteInfo.notes}.</p>
    {/if}
    {#if deleteInfo.refs}
      <p>Ссылки ⛔ на удалённые задачи будут убраны из задач: {deleteInfo.refs}.</p>
    {/if}
    <p class="pp-dim">Отменить можно только правкой файла.</p>
    <div class="pp-buttons">
      <button type="button" onclick={() => (confirmingDelete = false)}>Отмена</button>
      <button type="button" class="pp-danger" onclick={() => ondelete?.()}>Удалить</button>
    </div>
  </div>
{:else if confirmingDelete && deleteInfo && initial?.task}
  <div class="pp-backdrop pp-backdrop-top" role="presentation" onclick={() => (confirmingDelete = false)}></div>
  <div class="pp-dialog pp-confirm" role="alertdialog">
    <h3>Удалить задачу?</h3>
    <p>«{initial.task.description}» будет удалена из файла.</p>
    {#if deleteInfo.subtasks}
      <p>Вместе с ней удалятся подзадачи: {deleteInfo.subtasks}.</p>
    {/if}
    {#if deleteInfo.refs}
      <p>Ссылки ⛔ на неё будут убраны из задач: {deleteInfo.refs}.</p>
    {/if}
    <p class="pp-dim">Отменить можно только правкой файла.</p>
    <div class="pp-buttons">
      <button type="button" onclick={() => (confirmingDelete = false)}>Отмена</button>
      <button type="button" class="pp-danger" onclick={() => ondelete?.()}>Удалить</button>
    </div>
  </div>
{/if}
