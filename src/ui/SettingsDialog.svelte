<script lang="ts" module>
  import type { ProjectMarker } from "../core/types";

  export interface SettingsResult {
    stages: string[];
    markers: ProjectMarker[];
  }
</script>

<script lang="ts">
  import { getI18n } from "./i18n";
  const { t, words } = getI18n();
  import { dialogKeys } from "./dialogKeys";
  // Project settings — stored in the file's frontmatter (`stages:`, `markers:`).
  import { untrack } from "svelte";
  import { todayIso } from "../core/taskLineEditor";
  import DateField from "./DateField.svelte";

  let { stages, found, markers, onsave, oncancel }: {
    /** Declared in frontmatter */
    stages: string[];
    /** `#stage…` tags present on tasks */
    found: string[];
    markers: ProjectMarker[];
    onsave: (r: SettingsResult) => void;
    oncancel: () => void;
  } = $props();

  // ── stages ──
  let list = $state(untrack(() => [...stages]));
  let draft = $state("");

  const missing = $derived(found.filter(s => !list.includes(s)));
  const normalized = $derived(normalize(draft));
  const canAdd = $derived(!!normalized && !list.includes(normalized));

  /** "#Stage 3" / "3" → "stage3": a stage is a tag, so no spaces and the prefix is required. */
  function normalize(s: string): string {
    const t = s.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (!t) return "";
    return /^stage/i.test(t) ? "stage" + t.slice(5) : `stage${t}`;
  }

  function add(e?: Event) {
    e?.preventDefault();
    if (!canAdd) return;
    list = [...list, normalized];
    draft = "";
  }

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    list = next;
  }

  // ── markers ──
  const PALETTE = ["red", "#F6AE2D", "#6BBF59", "#2f80ed", "#9B5DE5", "#6b7280"];
  let marks = $state(untrack(() => markers.map(m => ({ date: String(m.date), label: m.label ?? "", color: m.color ?? "red" }))));

  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const marksValid = $derived(marks.every(m => ISO.test(m.date)));

  function addMarker() {
    marks = [...marks, { date: todayIso(), label: "", color: "red" }];
  }

  /** `<input type=color>` needs #rrggbb; a named colour shows as black there but stays as typed. */
  function hex(color: string): string {
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";
  }

  function save() {
    if (!marksValid) return;
    const sorted = [...marks]
      .map(m => ({ date: m.date, label: m.label.trim(), color: m.color.trim() || "red" }))
      .sort((a, b) => a.date.localeCompare(b.date));
    onsave({ stages: list, markers: sorted });
  }
</script>

<div class="pp-backdrop" role="presentation" onclick={oncancel}></div>
<div class="pp-dialog pp-settings" use:dialogKeys={e => { if (e.key === "Escape") oncancel(); }}>
  <h3>{t("Настройки проекта")}</h3>

  <!-- ── Этапы ── -->
  <div class="pp-section-title">{t("Этапы")} <span class="pp-dim">{t("(предлагаются галочками в карточке задачи)")}</span></div>
  {#if list.length}
    <ul class="pp-stage-list">
      {#each list as s, i (s)}
        <li>
          <span>#{s}</span>
          {#if !found.includes(s)}<span class="pp-dim">{t("не используется")}</span>{/if}
          <span class="pp-spacer"></span>
          <button type="button" title={t("Выше")} disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
          <button type="button" title={t("Ниже")} disabled={i === list.length - 1} onclick={() => move(i, 1)}>↓</button>
          <button type="button" title={t("Убрать из списка (теги в задачах не трогаются)")} onclick={() => (list = list.filter(x => x !== s))}>×</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="pp-dim">{t("Список пуст.")}</p>
  {/if}

  <form class="pp-row" onsubmit={add}>
    <input placeholder="stage3" bind:value={draft} />
    <button type="submit" disabled={!canAdd}>{t("Добавить")}{normalized && canAdd ? ` #${normalized}` : ""}</button>
  </form>

  {#if missing.length}
    <div class="pp-row">
      <span class="pp-dim">{t("В задачах есть ещё")}: {missing.map(s => "#" + s).join(" ")}</span>
      <button type="button" onclick={() => (list = [...list, ...missing])}>{t("Добавить найденные")}</button>
    </div>
  {/if}

  <!-- ── Маркеры ── -->
  <div class="pp-section-title">{t("Маркеры")} <span class="pp-dim">{t("(вертикальные линии на диаграмме; «Сегодня» рисуется всегда)")}</span></div>
  {#if marks.length}
    <div class="pp-marker-list">
      {#each marks as m, i (i)}
        <div class="pp-marker-row">
          <DateField bind:value={m.date} invalid={!ISO.test(m.date)} />
          <input class="pp-marker-label" placeholder={t("Подпись")} bind:value={m.label} />
          <span class="pp-swatch" style="background:{m.color}"></span>
          <input class="pp-marker-color" bind:value={m.color} title={t("CSS-цвет: red, #2f80ed…")} />
          <input type="color" value={hex(m.color)} oninput={e => (m.color = (e.target as HTMLInputElement).value)} title={t("Выбрать цвет")} />
          <button type="button" title={t("Удалить маркер")} onclick={() => (marks = marks.filter((_, j) => j !== i))}>×</button>
        </div>
        <div class="pp-palette">
          {#each PALETTE as c (c)}
            <button type="button" class="pp-palette-dot" style="background:{c}" title={c} aria-label={c} onclick={() => (m.color = c)}></button>
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <p class="pp-dim">{t("Маркеров нет.")}</p>
  {/if}
  <div><button type="button" onclick={addMarker}>{t("+ Маркер")}</button></div>

  <div class="pp-buttons">
    <button type="button" onclick={oncancel}>{t("Отмена")}</button>
    <button type="button" class="pp-primary" disabled={!marksValid} onclick={save}>{t("Сохранить")}</button>
  </div>
</div>
