<script lang="ts">
  // Date input with SVAR's calendar in a popover. Replaces <input type=date>:
  // the native picker in WebView2 always opens downwards and gets clipped by
  // the window edge. Ours opens below the field, or above when there's no room,
  // and is `position: fixed`, so a scrolling list around the field can't clip it.
  import { Calendar, Locale, Willow } from "@svar-ui/svelte-core";
  import { ru } from "@svar-ui/core-locales";
  import { isoToDate, dateToIso } from "./svarAdapter";

  let { value = $bindable(), invalid = false, clearable = false }: {
    value: string;
    invalid?: boolean;
    /** May be left empty (""); a red ✕ right of the calendar button clears it. */
    clearable?: boolean;
  } = $props();

  const CAL_W = 260;
  const CAL_H = 310;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  let text = $state(format(value));
  let open = $state(false);
  let field: HTMLElement;
  let pos = $state({ left: 0, top: 0 });

  $effect(() => { text = format(value); });

  function format(iso: string): string {
    return ISO.test(iso) ? iso.split("-").reverse().join(".") : iso;
  }

  /** "13.10.2026", "13.10.26", "2026-10-13" → ISO; anything else → null */
  function parse(s: string): string | null {
    const t = s.trim();
    if (ISO.test(t)) return t;
    const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (!m) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return d.getDate() === Number(m[1]) ? dateToIso(d) : null;
  }

  function commit() {
    const iso = parse(text);
    if (iso) value = iso;
    else if (clearable && text.trim() === "") value = "";
    else text = format(value);
  }

  function clear() {
    value = "";
    text = "";
    open = false;
  }

  function toggle() {
    if (open) { open = false; return; }
    const r = field.getBoundingClientRect();
    const below = field.ownerDocument.defaultView!.innerHeight - r.bottom;
    const top = below >= CAL_H + 4 || below >= r.top ? r.bottom + 2 : r.top - CAL_H - 2;
    const left = Math.min(r.left, field.ownerDocument.defaultView!.innerWidth - CAL_W - 4);
    pos = { left: Math.max(4, left), top: Math.max(4, top) };
    open = true;
  }

  function pick({ value: d }: { value: Date | null }) {
    if (d) value = dateToIso(d);
    open = false;
  }

  /**
   * Render into <body>: the dialogs are centred with `transform`, and inside a
   * transformed ancestor `position: fixed` is relative to that ancestor, not
   * the window — the popover would land off by the dialog's offset.
   */
  function portal(node: HTMLElement) {
    const root = field.closest<HTMLElement>(".pp-scope")!;
    root.appendChild(node);
    const origin = root.getBoundingClientRect();
    node.style.position = "absolute";
    node.style.left = `${pos.left - origin.left}px`;
    node.style.top = `${pos.top - origin.top}px`;
    // Snap to the real height once rendered: above → bottom edge touches the field.
    const r = field.getBoundingClientRect();
    if (pos.top < r.top) node.style.top = `${Math.max(4, r.top - node.offsetHeight - 2) - origin.top}px`;
    return { destroy: () => node.remove() };
  }

  function outside(e: MouseEvent) {
    if (open && !field.contains(e.target as Node) && !(e.target as HTMLElement).closest(".pp-cal-pop")) open = false;
  }
  function calendarEvents(node: HTMLElement) {
    const doc = node.ownerDocument;
    const win = doc.defaultView!;
    const key = (e: KeyboardEvent) => {
      if (open && e.key === "Escape" && node.closest(".pp-scope")?.contains(e.target as Node)) {
        e.stopImmediatePropagation(); open = false;
      }
    };
    const scroll = (e: Event) => { if (open && !(e.target as HTMLElement).closest?.(".pp-cal-pop")) open = false; };
    const resize = () => { open = false; };
    doc.addEventListener("mousedown", outside);
    doc.addEventListener("keydown", key, true);
    doc.addEventListener("scroll", scroll, true);
    win.addEventListener("resize", resize);
    return { destroy() {
      doc.removeEventListener("mousedown", outside);
      doc.removeEventListener("keydown", key, true);
      doc.removeEventListener("scroll", scroll, true);
      win.removeEventListener("resize", resize);
    } };
  }
</script>

<!-- capture phase: Esc closes the calendar before the dialog's own Esc handler sees it;
     scroll of any container (e.g. the marker list) closes it rather than leaving it floating -->
<span class="pp-datefield" class:pp-clearable={clearable} class:pp-invalid={invalid || (text.trim() === "" ? !clearable : !parse(text))} bind:this={field} use:calendarEvents>
  <input
    value={text}
    oninput={e => (text = (e.target as HTMLInputElement).value)}
    onblur={commit}
    onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
    placeholder="ДД.ММ.ГГГГ"
  />
  <button type="button" class="pp-date-cal" title="Календарь" onclick={toggle}>📅</button>
  {#if clearable}
    <button type="button" class="pp-date-clear" title="Очистить" disabled={!value && !text} onclick={clear}>✕</button>
  {/if}
</span>

{#if open}
  <div class="pp-cal-pop" use:portal style="left:{pos.left}px;top:{pos.top}px">
    <Locale words={ru}>
      <Willow fonts={false}>
        <Calendar value={ISO.test(value) ? isoToDate(value) : new Date()} buttons={["today"]} onchange={pick} />
      </Willow>
    </Locale>
  </div>
{/if}
