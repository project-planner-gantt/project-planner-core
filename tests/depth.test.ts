import { describe, it, expect } from 'vitest';
import { parseProject, parseTaskLine } from '../src/core/parser';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { changeTaskDepth, changeGroupDepth, taskDepthMoves, groupDepthMoves } from '../src/core/depth';

const parse = (lines: string[]) => parseProject(lines.join('\n'), 'p.md', DEFAULT_SETTINGS);
const task = (lines: string[], n: number) => parseTaskLine(lines[n], n, 'p.md', DEFAULT_SETTINGS)!;

describe('change branch depth', () => {
  it('indents the whole task block under the previous sibling', async () => {
    const lines = ['# P', '- [ ] A', '- [ ] B', '\tnotes', '\t- [ ] child', '- [ ] C'];
    const result = changeTaskDepth(lines, task(lines, 2), 'indent');
    expect(result).toEqual(['# P', '- [ ] A', '\t- [ ] B', '\t\tnotes', '\t\t- [ ] child', '- [ ] C']);
    const root = (await parse(result)).groups[0];
    expect(root.tasks[0].subtasks[0].subtasks).toHaveLength(1);
    expect(root.tasks).toHaveLength(2);
    expect(taskDepthMoves(lines, task(lines, 1))).toEqual({ indent: false, outdent: false });
  });

  it('outdents after the whole parent without capturing following children', async () => {
    const lines = ['# P', '- [ ] A', '  - [ ] B', '    - [ ] child', '  - [ ] C', '- [ ] D'];
    const result = changeTaskDepth(lines, task(lines, 2), 'outdent');
    expect(result).toEqual(['# P', '- [ ] A', '  - [ ] C', '- [ ] B', '  - [ ] child', '- [ ] D']);
    const root = (await parse(result)).groups[0];
    expect(root.tasks.map(t => t.subtasks.length)).toEqual([1, 1, 0]);
  });

  it('moves group descendants together and leaves later siblings with the parent', async () => {
    const lines = ['# P', '## A', '### B', '- [ ] task', '\t- [ ] child', '#### nested', '### C', '## D'];
    const roots = (await parse(lines)).groups;
    const result = changeGroupDepth(lines, roots[0].subgroups[0].subgroups[0], roots, 'outdent');
    expect(result).toEqual(['# P', '## A', '### C', '## B', '- [ ] task', '\t- [ ] child', '### nested', '## D']);
    const next = (await parse(result)).groups;
    expect(next[0].subgroups.map(g => g.heading)).toEqual(['A', 'B', 'D']);
    const indented = changeGroupDepth(result, next[0].subgroups[1], next, 'indent');
    const again = (await parse(indented)).groups[0];
    expect(again.subgroups[0].subgroups.map(g => g.heading)).toEqual(['C', 'B']);
    expect(again.subgroups[0].subgroups[1].tasks[0].subtasks).toHaveLength(1);
  });

  it('protects the project root and checks the deepest descendant', async () => {
    const lines = ['# P', '## A', '## B', '###### deep'];
    const roots = (await parse(lines)).groups;
    expect(groupDepthMoves(lines, roots[0], roots)).toEqual({ indent: false, outdent: false });
    expect(groupDepthMoves(lines, roots[0].subgroups[1], roots)).toEqual({ indent: false, outdent: false });
    expect(changeGroupDepth(lines, roots[0].subgroups[1], roots, 'indent')).toBe(lines);
  });
});
