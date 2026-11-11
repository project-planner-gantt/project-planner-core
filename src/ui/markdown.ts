// Небольшой рендер markdown → HTML для тултипов: заголовки, списки, задачи,
// цитаты, блоки кода и строчная разметка. Без внешних библиотек и безопасно:
// исходник сначала экранируется целиком, разметка добавляется поверх, так что
// HTML из файла остаётся текстом. `^id` задач не показываются — это шум.

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline marks over already escaped text. Code spans are kept out of the other rules. */
function inline(text: string): string {
  const codes: string[] = [];
  let s = escapeHtml(text.replace(/(^|\s)\^[\w-]+(?=\s|$)/g, "$1").trimEnd())
    .replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<b>${a ?? b}</b>`)
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, "$1<i>$2</i>")
    .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, "$1<i>$2</i>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/==(.+?)==/g, "<mark>$1</mark>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, `<span class="pp-mdr-link">$1</span>`)
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, `<span class="pp-mdr-link">$2</span>`)
    .replace(/(^|\s)(#[\w/-]+)/g, `$1<span class="pp-mdr-tag">$2</span>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

/** Nesting level: a tab or up to four spaces is one level. */
function level(indent: string): number {
  return indent.replace(/ {1,4}/g, "\t").length;
}

export function renderMarkdown(source: string): string {
  const out: string[] = [];
  let fence: string[] | null = null;
  let gap = false;

  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      if (fence) { out.push(`<pre>${escapeHtml(fence.join("\n"))}</pre>`); fence = null; }
      else fence = [];
      continue;
    }
    if (fence) { fence.push(line); continue; }
    if (line.trim() === "") { gap = out.length > 0; continue; }

    const cls = gap ? " pp-mdr-gap" : "";
    gap = false;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      out.push(`<div class="pp-mdr-h pp-mdr-h${m[1].length}${cls}">${inline(m[2])}</div>`);
    } else if ((m = line.match(/^(\s*)[-*+]\s+\[([ xX-])\]\s+(.*)$/))) {
      const closed = m[2] !== " "; // done or cancelled
      const mark = m[2] === "-" ? "☒" : closed ? "☑" : "☐";
      out.push(`<div class="pp-mdr-li${closed ? " pp-mdr-done" : ""}${cls}" style="--lvl:${level(m[1])}"><span class="pp-mdr-mark">${mark}</span>${inline(m[3])}</div>`);
    } else if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      const mark = /\d/.test(m[2]) ? escapeHtml(m[2]) : "•";
      out.push(`<div class="pp-mdr-li${cls}" style="--lvl:${level(m[1])}"><span class="pp-mdr-mark">${mark}</span>${inline(m[3])}</div>`);
    } else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      out.push(`<div class="pp-mdr-quote${cls}">${inline(m[1])}</div>`);
    } else if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      out.push(`<hr />`);
    } else {
      out.push(`<div class="pp-mdr-p${cls}">${inline(line.trim())}</div>`);
    }
  }
  if (fence) out.push(`<pre>${escapeHtml(fence.join("\n"))}</pre>`);
  return out.join("");
}
