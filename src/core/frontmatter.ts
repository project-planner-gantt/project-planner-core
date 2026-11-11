import { parseDocument } from "yaml";
import type { Lines } from "./edits";

/**
 * Set (or remove, with `undefined`) one top-level frontmatter key, keeping the
 * rest of the YAML — comments, order, quoting — as it was. Creates the
 * frontmatter block when the file has none.
 */
export function setFrontmatterKey(lines: Lines, key: string, value: unknown): Lines {
  const hasFm = lines[0]?.trim() === "---";
  const end = hasFm ? lines.findIndex((l, i) => i > 0 && l.trim() === "---") : -1;
  if (!hasFm || end <= 0) {
    if (value === undefined) return lines;
    return setFrontmatterKey(["---", "---", ...lines], key, value);
  }

  const doc = parseDocument(lines.slice(1, end).join("\n"));
  if (value === undefined) doc.delete(key);
  // Lists of plain values as one-liners — `stages: [stage1, stage2]` — the way
  // people write them by hand; lists of objects (markers) stay in block style.
  else doc.set(key, doc.createNode(value, { flow: Array.isArray(value) && value.every(v => typeof v !== "object") }));

  const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n$/, "");
  const body = yaml === "" || yaml === "{}" ? [] : yaml.split("\n");
  return [lines[0], ...body, ...lines.slice(end)];
}
