// ─── Moving a list subtree among its siblings ────────────────────────────────
//
// Tasks (`- [ ] …`), plain points (`- point of view`) and numbered items are
// all equivalent here: any of them can be moved, and any of them can be jumped
// over. Only a non-list line (heading, prose) or the file edge is a boundary.
//
// Pure functions over an array of lines, so the (fiddly) index arithmetic can
// be unit-tested without an Obsidian Editor. `main.ts` only adapts the editor
// to a string[] and writes the result back.

export interface TaskBlock {
  /** Index of the block's first line (the list item itself). */
  start: number;
  /** Index of the block's last line (deepest trailing child). */
  end: number;
  lines: string[];
}

export interface MoveResult {
  lines: string[];
  /** Line the cursor should end up on — the moved block's new start. */
  cursorLine: number;
}

/**
 * A list item: `- task`, `* point`, `+ point`, `1. point`, `1) point`.
 * Requires content after the marker, so a bare `-` is not one.
 */
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+\S/;

export function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Any list line — task, point or numbered item. Used both for "may this line
 * be moved" and for "may the block jump over this line": the two are the same
 * question.
 */
export function isListItem(line: string): boolean {
  return LIST_ITEM_RE.test(line);
}

/** Marker of a numbered item, split into indent / number / delimiter. */
const ORDERED_ITEM_RE = /^(\s*)(\d+)([.)]\s)/;

/** No sibling in that direction — the block stays put. */
export const NO_TARGET = -1;

/** The line at `startLine` plus every following deeper-indented line. */
export function findTaskBlock(lines: string[], startLine: number, baseIndent: number): TaskBlock {
  const blockLines: string[] = [lines[startLine]];
  let currentLine = startLine + 1;
  while (currentLine < lines.length) {
    if (getIndentLevel(lines[currentLine]) > baseIndent) {
      blockLines.push(lines[currentLine]);
      currentLine++;
    } else {
      break;
    }
  }
  return { start: startLine, end: startLine + blockLines.length - 1, lines: blockLines };
}

export function canMoveUp(lines: string[], startLine: number): boolean {
  for (let line = startLine - 1; line >= 0; line--) {
    if (lines[line].trim() === "") continue;
    return isListItem(lines[line]);
  }
  return false;
}

export function canMoveDown(lines: string[], endLine: number): boolean {
  for (let line = endLine + 1; line < lines.length; line++) {
    if (lines[line].trim() === "") continue;
    return isListItem(lines[line]);
  }
  return false;
}

export function findTargetLineUp(lines: string[], startLine: number, targetIndent: number): number {
  for (let line = startLine - 1; line >= 0; line--) {
    const lineContent = lines[line];
    if (lineContent.trim() === "") continue;
    const indent = getIndentLevel(lineContent);
    if (indent === targetIndent) return line;
    if (indent < targetIndent) return line + 1;
  }
  return 0;
}

export function findTargetLineDown(lines: string[], endLine: number, targetIndent: number): number {
  let nextBlockStart = NO_TARGET;
  for (let line = endLine + 1; line < lines.length; line++) {
    const lineContent = lines[line];
    if (lineContent.trim() === "") continue;
    if (getIndentLevel(lineContent) <= targetIndent) {
      nextBlockStart = line;
      break;
    }
  }
  if (nextBlockStart === NO_TARGET) return lines.length;
  // Shallower line = the parent's next sibling: the block has no sibling of its
  // own left, so it stays inside its parent (mirrors findTargetLineUp, which
  // returns the block's own start in that case).
  if (getIndentLevel(lines[nextBlockStart]) < targetIndent) return NO_TARGET;
  return findTaskBlock(lines, nextBlockStart, targetIndent).end + 1;
}

/**
 * First and last line of the contiguous list run the block belongs to. The run
 * ends at a non-list line, at a shallower line (the parent) or at the file
 * edge; blank lines inside it are not a break, matching canMoveUp/canMoveDown.
 */
export function siblingRunBounds(
  lines: string[],
  block: TaskBlock,
  indent: number
): { start: number; end: number } {
  let start = block.start;
  for (let line = block.start - 1; line >= 0; line--) {
    const content = lines[line];
    if (content.trim() === "") continue;
    if (!isListItem(content) || getIndentLevel(content) < indent) break;
    start = line;
  }
  let end = block.end;
  for (let line = block.end + 1; line < lines.length; line++) {
    const content = lines[line];
    if (content.trim() === "") continue;
    if (!isListItem(content) || getIndentLevel(content) < indent) break;
    end = line;
  }
  return { start, end };
}

/** Indices of the run's numbered items at exactly `indent`. */
function orderedHeads(lines: string[], start: number, end: number, indent: number): number[] {
  const heads: number[] = [];
  for (let line = start; line <= end && line < lines.length; line++) {
    if (getIndentLevel(lines[line]) === indent && ORDERED_ITEM_RE.test(lines[line])) {
      heads.push(line);
    }
  }
  return heads;
}

/**
 * In an ordered list the number belongs to the position, not to the item: after
 * a move `1.` must still be on the run's first line. Reassigns the run's
 * original numbers, in document order, to whatever items now occupy those
 * slots — so `1. a / 2. b` becomes `1. b / 2. a`, never `2. b / 1. a`.
 *
 * Matters beyond cosmetics: Obsidian renumbers an ordered list from its first
 * item, so a stray `2.` on top silently shifts the whole list to 2, 3, 4…
 * A lazily numbered list (`1.` on every line) keeps its numbers as they were.
 */
export function restoreOrderedNumbers(
  originalLines: string[],
  movedLines: string[],
  runStart: number,
  runEnd: number,
  indent: number
): string[] {
  const numbers = orderedHeads(originalLines, runStart, runEnd, indent)
    .map((line) => originalLines[line].match(ORDERED_ITEM_RE)?.[2])
    .filter((n): n is string => n !== undefined);
  const heads = orderedHeads(movedLines, runStart, runEnd, indent);
  // Same items, only reordered — a mismatch means the assumption broke, so
  // leave the text alone rather than scramble the numbering.
  if (heads.length !== numbers.length) return movedLines;

  const result = [...movedLines];
  heads.forEach((line, position) => {
    result[line] = result[line].replace(
      ORDERED_ITEM_RE,
      (_match, lead: string, _number: string, delimiter: string) =>
        lead + numbers[position] + delimiter
    );
  });
  return result;
}

/**
 * Move the block starting at `cursorLine` past its previous/next sibling.
 * Returns `null` when the move is not possible (cursor not on a list item,
 * block already at the edge of its list, neighbour is not a list item).
 */
export function moveTaskBlock(
  lines: string[],
  cursorLine: number,
  direction: "up" | "down"
): MoveResult | null {
  const content = lines[cursorLine];
  if (content === undefined || !isListItem(content)) return null;

  const currentIndent = getIndentLevel(content);
  const block = findTaskBlock(lines, cursorLine, currentIndent);

  if (direction === "up" && !canMoveUp(lines, block.start)) return null;
  if (direction === "down" && !canMoveDown(lines, block.end)) return null;

  const targetLine = direction === "up"
    ? findTargetLineUp(lines, cursorLine, currentIndent)
    : findTargetLineDown(lines, block.end, currentIndent);

  if (targetLine === NO_TARGET || targetLine === block.start) return null;

  const linesWithoutBlock = [
    ...lines.slice(0, block.start),
    ...lines.slice(block.end + 1),
  ];
  const adjustedTarget = targetLine > block.end
    ? targetLine - block.lines.length
    : targetLine;

  const movedLines = [
    ...linesWithoutBlock.slice(0, adjustedTarget),
    ...block.lines,
    ...linesWithoutBlock.slice(adjustedTarget),
  ];

  // The move stays inside the run, so the run keeps its line range and only the
  // numbering has to be put back onto the positions it belongs to.
  const run = siblingRunBounds(lines, block, currentIndent);

  return {
    lines: restoreOrderedNumbers(lines, movedLines, run.start, run.end, currentIndent),
    cursorLine: adjustedTarget,
  };
}
