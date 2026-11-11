<script lang="ts">
  // Content for SVAR's <Tooltip>: gets the hovered task (our SvarTask) or link.
  import type { PlanRow } from "../core/types";
  import { renderMarkdown } from "./markdown";

  let { api, data }: { api: any; data: any } = $props();

  const row: PlanRow | undefined = $derived(data?.task?.row);
  const task = $derived(row?.task);

  const name = (id: string) => api?.getTask(id)?.row?.text ?? id;
  const deps = $derived(
    (task?.dependsOn ?? []).map((d: any) => (d.type === "local" ? name(d.id) : `${d.file} → ^${d.id}`))
  );
  const stages = $derived((task?.tags ?? []).filter((t: string) => t.startsWith("stage")));
  const kindLabel: Record<string, string> = { root: "Проект", group: "Группа", milestone: "Веха", task: "Задача" };
</script>

{#if data?.link}
  <div class="pp-tip">
    <div class="pp-tip-title">Связь</div>
    <div>{name(String(data.link.source))} → {name(String(data.link.target))}</div>
  </div>
{:else if row}
  <div class="pp-tip">
    <div class="pp-tip-title">{task?.description ?? row.text}</div>
    <div class="pp-tip-meta">{kindLabel[row.kind]}{task?.number ? ` ${task.number}` : ""}</div>
    {#if row.kind === "milestone"}
      <div>Дата: {row.end}</div>
    {:else}
      <div>Старт: {row.start} · Финиш: {row.end}</div>
    {/if}
    {#if task?.cancelled}
      <div>🚫 Отменена</div>
    {:else if row.done}
      <div>✅ Выполнена{task?.completionDate ? ` ${task.completionDate}` : ""}</div>
    {:else if row.kind !== "milestone"}
      <div>Прогресс: {Math.round(row.progress * 100)}%</div>
    {/if}
    {#if stages.length}<div>Этапы: {stages.map((s: string) => "#" + s).join(" ")}</div>{/if}
    {#if deps.length}<div>Зависит от: {deps.join(", ")}</div>{/if}
    {#if row.notes}
      <!-- renderMarkdown escapes the source first: no HTML from the file gets through -->
      <div class="pp-tip-notes">{@html renderMarkdown(row.notes)}</div>
    {/if}
  </div>
{/if}
