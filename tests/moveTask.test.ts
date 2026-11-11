import { describe, it, expect } from "vitest";
import { parseProject, allTasks } from "../src/core/parser";
import { moveTask, type Drop } from "../src/core/edits";
import { DEFAULT_SETTINGS, type TaskGroup } from "../src/core/types";

const doc = (...lines: string[]) => lines;

async function parsed(lines: string[]) {
  const p = await parseProject(lines.join("\n"), "p.md", DEFAULT_SETTINGS);
  const task = (id: string) => allTasks(p).find(t => t.id === id)!;
  const groups = (gs: TaskGroup[]): TaskGroup[] => gs.flatMap(g => [g, ...groups(g.subgroups)]);
  const group = (heading: string) => groups(p.groups).find(g => g.heading === heading)!;
  return { task, group };
}

async function move(lines: string[], id: string, drop: (q: Awaited<ReturnType<typeof parsed>>) => Drop) {
  const q = await parsed(lines);
  return moveTask(lines, q.task(id), drop(q));
}

describe("moveTask", () => {
  const flat = doc(
    "# P",
    "- [ ] a ^a",
    "- [ ] b ^b",
    "- [ ] c ^c",
  );

  it("reorders siblings both ways", async () => {
    expect(await move(flat, "c", q => ({ mode: "before", task: q.task("a") })))
      .toEqual(doc("# P", "- [ ] c ^c", "- [ ] a ^a", "- [ ] b ^b"));
    expect(await move(flat, "a", q => ({ mode: "after", task: q.task("c") })))
      .toEqual(doc("# P", "- [ ] b ^b", "- [ ] c ^c", "- [ ] a ^a"));
  });

  it("is a no-op when dropped on its own place", async () => {
    expect(await move(flat, "b", q => ({ mode: "after", task: q.task("a") }))).toEqual(flat);
    expect(await move(flat, "b", q => ({ mode: "before", task: q.task("b") }))).toEqual(flat);
  });

  const nested = doc(
    "# P",
    "- [ ] a ^a",
    "\t- [ ] a1 ^a1",
    "\t\tnote under a1",
    "\t- [ ] a2 ^a2",
    "- [ ] b ^b",
    "\tplain text of b",
    "",
    "\tmore text of b after a blank",
    "- [ ] c ^c",
  );

  it("carries subtasks and nested text along", async () => {
    expect(await move(nested, "a", q => ({ mode: "after", task: q.task("b") }))).toEqual(doc(
      "# P",
      "- [ ] b ^b",
      "\tplain text of b",
      "",
      "\tmore text of b after a blank",
      "- [ ] a ^a",
      "\t- [ ] a1 ^a1",
      "\t\tnote under a1",
      "\t- [ ] a2 ^a2",
      "- [ ] c ^c",
    ));
  });

  it("dropping after a task goes past its whole block", async () => {
    expect(await move(nested, "c", q => ({ mode: "after", task: q.task("a") }))).toEqual(doc(
      "# P",
      "- [ ] a ^a",
      "\t- [ ] a1 ^a1",
      "\t\tnote under a1",
      "\t- [ ] a2 ^a2",
      "- [ ] c ^c",
      "- [ ] b ^b",
      "\tplain text of b",
      "",
      "\tmore text of b after a blank",
    ));
  });

  it("re-indents when moving a level up or down", async () => {
    expect(await move(nested, "a1", q => ({ mode: "before", task: q.task("c") }))).toEqual(doc(
      "# P",
      "- [ ] a ^a",
      "\t- [ ] a2 ^a2",
      "- [ ] b ^b",
      "\tplain text of b",
      "",
      "\tmore text of b after a blank",
      "- [ ] a1 ^a1",
      "\tnote under a1",
      "- [ ] c ^c",
    ));
    expect(await move(nested, "b", q => ({ mode: "after", task: q.task("a1") }))).toEqual(doc(
      "# P",
      "- [ ] a ^a",
      "\t- [ ] a1 ^a1",
      "\t\tnote under a1",
      "\t- [ ] b ^b",
      "\t\tplain text of b",
      "",
      "\t\tmore text of b after a blank",
      "\t- [ ] a2 ^a2",
      "- [ ] c ^c",
    ));
  });

  it("becomes the subtask of a task without subtasks", async () => {
    expect(await move(nested, "c", q => ({ mode: "into-task", task: q.task("b") }))).toEqual(doc(
      "# P",
      "- [ ] a ^a",
      "\t- [ ] a1 ^a1",
      "\t\tnote under a1",
      "\t- [ ] a2 ^a2",
      "- [ ] b ^b",
      "\tplain text of b",
      "",
      "\tmore text of b after a blank",
      "\t- [ ] c ^c",
    ));
  });

  it("refuses to drop a task into its own block", async () => {
    expect(await move(nested, "a", q => ({ mode: "after", task: q.task("a1") }))).toEqual(nested);
    expect(await move(nested, "a", q => ({ mode: "into-task", task: q.task("a2") }))).toEqual(nested);
  });

  const sections = doc(
    "# P",
    "",
    "## A",
    "",
    "- [ ] a ^a",
    "",
    "## B",
    "",
    "Some text.",
    "",
    "### B1",
    "",
    "- [ ] b1 ^b1",
    "",
    "## Empty",
    "",
    "## C",
    "",
    "- [ ] c ^c",
    "\t- [ ] c1 ^c1",
  );

  it("moves between sections without piling up blank lines", async () => {
    expect(await move(sections, "a", q => ({ mode: "before", task: q.task("c") }))).toEqual(doc(
      "# P",
      "",
      "## A",
      "",
      "## B",
      "",
      "Some text.",
      "",
      "### B1",
      "",
      "- [ ] b1 ^b1",
      "",
      "## Empty",
      "",
      "## C",
      "",
      "- [ ] a ^a",
      "- [ ] c ^c",
      "\t- [ ] c1 ^c1",
    ));
  });

  it("drops into an empty section and into a section's own tasks", async () => {
    expect(await move(sections, "c1", q => ({ mode: "into-group", group: q.group("Empty") }))).toEqual(doc(
      "# P",
      "",
      "## A",
      "",
      "- [ ] a ^a",
      "",
      "## B",
      "",
      "Some text.",
      "",
      "### B1",
      "",
      "- [ ] b1 ^b1",
      "",
      "## Empty",
      "- [ ] c1 ^c1",
      "",
      "## C",
      "",
      "- [ ] c ^c",
    ));
    // B's own tasks go before its sub-heading B1
    expect(await move(sections, "a", q => ({ mode: "into-group", group: q.group("B") }))).toEqual(doc(
      "# P",
      "",
      "## A",
      "",
      "## B",
      "",
      "Some text.",
      "- [ ] a ^a",
      "",
      "### B1",
      "",
      "- [ ] b1 ^b1",
      "",
      "## Empty",
      "",
      "## C",
      "",
      "- [ ] c ^c",
      "\t- [ ] c1 ^c1",
    ));
  });

  it("keeps spaces-indented inner lines relative to the block", async () => {
    const spaced = doc("# P", "- [ ] a ^a", "    - [ ] a1 ^a1", "        - [ ] a11 ^a11", "- [ ] b ^b");
    expect(await move(spaced, "a1", q => ({ mode: "after", task: q.task("b") }))).toEqual(doc(
      "# P", "- [ ] a ^a", "- [ ] b ^b", "- [ ] a1 ^a1", "    - [ ] a11 ^a11",
    ));
  });
});
