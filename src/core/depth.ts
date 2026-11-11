import type { TaskGroup, TaskLine } from './types';
import { groupRange, moveTask, type Lines } from './edits';

export type DepthMove = 'indent' | 'outdent';

function taskTargets(lines: Lines, task: TaskLine) {
  const at = task.lineNumber;
  const indent = (s: string) => s.match(/^\s*/)![0].length;
  let previous: number | undefined;
  let parent: number | undefined;
  for (let i = at - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    const d = indent(lines[i]);
    if (d > indent(lines[at])) continue;
    if (d === indent(lines[at])) {
      if (!/^\s*- \[.\] /.test(lines[i])) break;
      previous ??= i;
    } else {
      if (/^\s*- \[.\] /.test(lines[i])) parent = i;
      break;
    }
  }
  return { previous, parent };
}

export function taskDepthMoves(lines: Lines, task: TaskLine) {
  if (!/^\s*- \[.\] /.test(lines[task.lineNumber] ?? '')) return { indent: false, outdent: false };
  const t = taskTargets(lines, task);
  return { indent: t.previous !== undefined, outdent: t.parent !== undefined };
}

export function changeTaskDepth(lines: Lines, task: TaskLine, move: DepthMove): Lines {
  if (!taskDepthMoves(lines, task)[move]) return lines;
  const t = taskTargets(lines, task);
  const lineNumber = (move === 'indent' ? t.previous : t.parent)!;
  return moveTask(lines, task, { mode: move === 'indent' ? 'into-task' : 'after', task: { ...task, lineNumber } });
}

function context(group: TaskGroup, roots: TaskGroup[], parent?: TaskGroup): { siblings: TaskGroup[]; parent?: TaskGroup } | undefined {
  if (roots.some(g => g.filePath === group.filePath && g.lineNumber === group.lineNumber)) return { siblings: roots, parent };
  for (const g of roots) {
    const found = context(group, g.subgroups, g);
    if (found) return found;
  }
}

function groupChange(lines: Lines, group: TaskGroup, roots: TaskGroup[], move: DepthMove) {
  const c = context(group, roots);
  if (!c || group.level === 1) return;
  const index = c.siblings.findIndex(g => g.lineNumber === group.lineNumber && g.filePath === group.filePath);
  const target = move === 'indent' ? c.siblings[index - 1] : c.parent;
  if (!target || (move === 'outdent' && target.level <= 1)) return;
  const delta = move === 'indent' ? target.level + 1 - group.level : target.level - group.level;
  const [start, end] = groupRange(lines, group);
  if (lines[group.lineNumber]?.match(/^(#{1,6}) /)?.[1].length !== group.level) return;
  for (let i = group.lineNumber; i < end; i++) {
    const level = lines[i].match(/^(#{1,6}) /)?.[1].length;
    if (level && (level + delta > 6 || level + delta < 2)) return;
  }
  return { start, end, delta, at: move === 'indent' ? start : groupRange(lines, target)[1] };
}

export function groupDepthMoves(lines: Lines, group: TaskGroup, roots: TaskGroup[]) {
  return { indent: !!groupChange(lines, group, roots, 'indent'), outdent: !!groupChange(lines, group, roots, 'outdent') };
}

export function changeGroupDepth(lines: Lines, group: TaskGroup, roots: TaskGroup[], move: DepthMove): Lines {
  const c = groupChange(lines, group, roots, move);
  if (!c) return lines;
  const block = lines.slice(c.start, c.end).map(line => line.replace(/^(#{1,6})(?= )/, hashes => '#'.repeat(hashes.length + c.delta)));
  const rest = [...lines.slice(0, c.start), ...lines.slice(c.end)];
  const at = c.at > c.start ? c.at - block.length : c.at;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}
