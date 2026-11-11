<script lang="ts">
  // Grid cell with ⤒ ↑ ↓ ⤓: move tasks and groups among their siblings.
  // Hidden until the pointer is over the row. Only the open file gets buttons.
  import { getContext } from "svelte";
  import type { DepthMove } from "../core/depth";
  import type { ListMove } from "../core/edits";
  import { MOVER_KEY, type RowMover } from "./ganttConfig";

  let { row }: { row: any } = $props();
  const mover = getContext<RowMover | undefined>(MOVER_KEY);

  const can = $derived(mover?.can(row.row) ?? null);

  const buttons: { move: ListMove | DepthMove; title: string; path: string }[] = [
    { move: "top", title: "В начало списка", path: "M3 3h10M8 13V6M4.5 9.5 8 6l3.5 3.5" },
    { move: "up", title: "Выше", path: "M8 13V3M4.5 6.5 8 3l3.5 3.5" },
    { move: "down", title: "Ниже", path: "M8 3v10M4.5 9.5 8 13l3.5-3.5" },
    { move: "bottom", title: "В конец списка", path: "M3 13h10M8 3v7M4.5 6.5 8 10l3.5-3.5" },
    { move: "outdent", title: "Уменьшить вложенность", path: "M13 8H3M6.5 4.5 3 8l3.5 3.5" },
    { move: "indent", title: "Увеличить вложенность", path: "M3 8h10M9.5 4.5 13 8l-3.5 3.5" },
  ];

  const enabled = (m: ListMove | DepthMove) => m === "indent" || m === "outdent" ? can?.[m] : (m === "top" || m === "up" ? can?.up : can?.down);
</script>

<!-- the grid starts a row drag on mousedown and opens the card on dblclick: keep both off the buttons -->
{#if can}
  <div class="pp-move">
    {#each buttons as b (b.move)}
      <button
        type="button"
        title={b.title}
        aria-label={b.title}
        disabled={!enabled(b.move)}
        onmousedown={e => e.stopPropagation()}
        ondblclick={e => e.stopPropagation()}
        onclick={e => { e.stopPropagation(); mover?.move(row.row, b.move); }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d={b.path} /></svg>
      </button>
    {/each}
  </div>
{/if}
