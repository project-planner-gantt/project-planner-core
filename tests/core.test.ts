import { describe, it, expect } from "vitest";
import { parseProject, parseTaskLine } from "../src/core/parser";
import { mapProject, filterByStageTag, collectStageTags, ROOT_ID } from "../src/core/mapper";
import * as edits from "../src/core/edits";
import { ProjectStore, StaleEditError } from "../src/core/store";
import { DEFAULT_SETTINGS } from "../src/core/types";
import type { DocumentStorage as FileSystem } from "../src/core/document";

const S = DEFAULT_SETTINGS;
const md = (...lines: string[]) => lines.join("\n");

describe("parser", () => {
  it("parses dates, deps, tags, number and block id", () => {
    const t = parseTaskLine("- [ ] 1.1 | Do it #stage1 🛫 2026-01-01 📅 2026-01-05 🚴 40% ⛔ ^a ⛔ [[Other#^b]] ^me", 3, "p.md", S)!;
    expect(t).toMatchObject({
      id: "me", hasBlockId: true, number: "1.1", description: "Do it",
      startDate: "2026-01-01", dueDate: "2026-01-05", progress: 0.4, tags: ["stage1"],
    });
    expect(t.dependsOn).toEqual([{ type: "remote", file: "Other", id: "b" }, { type: "local", id: "a" }]);
  });

  it("nests sections under the H1 and drops everything after a second H1", async () => {
    const p = await parseProject(md("# P", "- [ ] top", "## A", "- [ ] a1", "\t- [ ] a1.1", "# Second", "- [ ] lost"), "p.md", S);
    expect(p.title).toBe("P");
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0].tasks.map(t => t.description)).toEqual(["top"]);
    expect(p.groups[0].subgroups[0].tasks[0].subtasks[0].description).toBe("a1.1");
  });

  it("tolerates CRLF line endings", async () => {
    const p = await parseProject("# P\r\n- [ ] x 📅 2026-01-02 ^id1\r\n", "p.md", S);
    expect(p.groups[0].tasks[0]).toMatchObject({ id: "id1", dueDate: "2026-01-02" });
  });

  it("resolves an embed through the callback", async () => {
    const p = await parseProject(md("# P", "![[Child]]"), "dir/p.md", S, async name =>
      name === "Child" ? { path: "dir/Child.md", content: "- [ ] embedded 📅 2026-02-01 ^e" } : null);
    expect(p.groups[0].tasks[0]).toMatchObject({ id: "e", filePath: "dir/Child.md" });
  });
});

describe("mapper", () => {
  const project = () => parseProject(md(
    "# P",
    "## Notes heading",
    "just text",
    "## A",
    "- [x] done 🛫 2026-01-01 📅 2026-01-03 ^d",
    "- [ ] next #stage1 ⏳ 2026-01-04 📅 2026-01-06 ⛔ ^d ^n",
    "\t- [ ] child without dates ^c",
    "- [ ] ship #milestone 📅 2026-01-10 ⛔ ^ghost ^m",
  ), "p.md", S);

  it("builds root + groups + tasks with inclusive ISO dates", async () => {
    const plan = mapProject(await project());
    const byId = new Map(plan.rows.map(r => [r.id, r]));
    expect(plan.rows[0]).toMatchObject({ id: ROOT_ID, kind: "root", text: "P", start: "2026-01-01", end: "2026-01-10" });
    expect(plan.rows.some(r => r.text === "Notes heading")).toBe(false);
    expect(byId.get("n")).toMatchObject({ kind: "task", start: "2026-01-04", end: "2026-01-06" });
    // child inherits the parent's span
    expect(byId.get("c")).toMatchObject({ parent: "n", start: "2026-01-04", end: "2026-01-06" });
    expect(byId.get("m")).toMatchObject({ kind: "milestone", start: "2026-01-10", end: "2026-01-10" });
    expect(plan.rows[0].progress).toBeCloseTo(1 / 4);
  });

  it("keeps valid links only", async () => {
    const plan = mapProject(await project());
    expect(plan.links.map(l => [l.source, l.target])).toEqual([["d", "n"]]);
  });

  it("filters by stage tag keeping ancestors", async () => {
    const plan = mapProject(await project());
    expect(collectStageTags(plan.rows)).toEqual(["stage1"]);
    const f = filterByStageTag(plan, "stage1");
    expect(f.rows.map(r => r.kind)).toEqual(["root", "group", "task"]);
    expect(f.links).toEqual([]);
  });
});

describe("edits", () => {
  const lineTask = (raw: string) => parseTaskLine(raw, 0, "p.md", S)!;

  it("moves dates, inserting ⏳/📅 before deps and own id", () => {
    const t = lineTask("- [ ] x ⛔ ^a ^me");
    expect(edits.setTaskDates([t.raw], t, "2026-01-01", "2026-01-02")).toEqual(["- [ ] x ⏳ 2026-01-01 📅 2026-01-02 ⛔ ^a ^me"]);
    const s = lineTask("- [ ] x 🛫 2025-12-01 📅 2025-12-02 ^me");
    expect(edits.setTaskDates([s.raw], s, "2026-01-01", "2026-01-02")).toEqual(["- [ ] x 🛫 2026-01-01 📅 2026-01-02 ^me"]);
  });

  it("closes a task, converting ⏳ to 🛫", () => {
    const t = lineTask("- [ ] x ⏳ 2026-01-01 📅 2026-01-02 ^me");
    expect(edits.closeTask([t.raw], t, "2026-01-03")).toEqual(["- [x] x 🛫 2026-01-01 📅 2026-01-02 ✅ 2026-01-03 ^me"]);
  });

  it("reopens a done task: [ ] and no ✅, dates kept", () => {
    const t = lineTask("- [x] x 🛫 2026-01-01 📅 2026-01-02 ✅ 2026-01-03 ^me");
    expect(edits.reopenTask([t.raw], t)).toEqual(["- [ ] x 🛫 2026-01-01 📅 2026-01-02 ^me"]);
  });

  it("clears own dates: null removes 🛫/⏳ or 📅, the rest of the line stays", () => {
    const t = lineTask("- [ ] x 🛫 2026-01-01 ⏳ 2026-01-01 📅 2026-01-02 ⛔ ^a ^me");
    expect(edits.setTaskDates([t.raw], t, null, null)).toEqual(["- [ ] x ⛔ ^a ^me"]);
    expect(edits.setTaskDates([t.raw], t, null, "2026-01-05")).toEqual(["- [ ] x 📅 2026-01-05 ⛔ ^a ^me"]);
    const bare = lineTask("- [ ] x ^me");
    expect(edits.setTaskDates([bare.raw], bare, "2026-01-01", null)).toEqual(["- [ ] x ⏳ 2026-01-01 ^me"]);
  });

  it("adds a task without dates", () => {
    const { lines } = edits.addTask(["# P", "- [ ] a ^a"], 0, "new", null, null);
    expect(lines[2]).toMatch(/^- \[ \] new \^task-[\w-]+$/);
    const sub = edits.addSubtask(["# P", "- [ ] a ^a"], 1, "sub", "2026-01-01", null).lines;
    expect(sub[2]).toMatch(/^\t- \[ \] sub ⏳ 2026-01-01 \^task-[\w-]+$/);
  });

  it("cancels an open task and restores it: [ ] ⇄ [-], dates kept", () => {
    const t = lineTask("- [ ] x ⏳ 2026-01-01 📅 2026-01-02 ^me");
    const cancelled = edits.cancelTask([t.raw], t);
    expect(cancelled).toEqual(["- [-] x ⏳ 2026-01-01 📅 2026-01-02 ^me"]);
    const c = lineTask(cancelled[0]);
    expect(c).toMatchObject({ cancelled: true, done: false, description: "x" });
    expect(edits.restoreTask(cancelled, c)).toEqual([t.raw]);
  });

  it("renames a cancelled task", () => {
    const t = lineTask("- [-] 1.2 | old 📅 2026-01-02 ^me");
    expect(edits.renameTask([t.raw], t, "new")).toEqual(["- [-] 1.2 | new 📅 2026-01-02 ^me"]);
  });

  it("adds and removes a dependency", () => {
    const t = lineTask("- [ ] x ^me");
    const added = edits.addDependency([t.raw], t, "src");
    expect(added).toEqual(["- [ ] x ⛔ ^src ^me"]);
    expect(edits.removeDependency(added, t, "src")).toEqual(["- [ ] x ^me"]);
  });

  it("sets progress and renames", () => {
    const t = lineTask("- [ ] 1.2 | old name 📅 2026-01-02 ^me");
    expect(edits.setProgress([t.raw], t, 0.5)).toEqual(["- [ ] 1.2 | old name 📅 2026-01-02 🚴 50% ^me"]);
    expect(edits.renameTask([t.raw], t, "new")).toEqual(["- [ ] 1.2 | new 📅 2026-01-02 ^me"]);
  });

  it("adds a task at the end of the group's list, before trailing blanks", () => {
    const { lines } = edits.addTask(["## A", "- [ ] a", "", "## B"], 0, "new", "2026-01-01", "2026-01-02");
    expect(lines[2]).toMatch(/^- \[ \] new ⏳ 2026-01-01 📅 2026-01-02 \^task-/);
    expect(lines[3]).toBe("");
  });
});

class FakeFs implements FileSystem {
  readonly kind = "memory" as const;
  files = new Map<string, string>();
  writes = 0;
  private cbs: (() => void)[] = [];
  async readText(p: string) { return this.files.get(p)!; }
  async writeText(p: string, c: string) { this.files.set(p, c); this.writes++; }
  async exists(p: string) { return this.files.has(p); }
  async watch(_p: string, cb: () => void) { this.cbs.push(cb); return () => {}; }
  async pickFile() { return null; }
  async saveAs() { return null; }
  /** Simulate another editor touching the file. */
  external(p: string, c: string) { this.files.set(p, c); this.cbs.forEach(cb => cb()); }
}

describe("ProjectStore", () => {
  it("assigns missing block ids once, keeping CRLF", async () => {
    const fs = new FakeFs();
    fs.files.set("p.md", "# P\r\n- [ ] a 📅 2026-01-02\r\n");
    const store = new ProjectStore(fs, S);
    await store.open("p.md");
    expect(fs.files.get("p.md")).toMatch(/^# P\r\n- \[ \] a 📅 2026-01-02 \^task-[\w-]+\r\n$/);
    expect(fs.writes).toBe(1);
  });

  it("puts the card's text on plan rows, for tooltips", async () => {
    const fs = new FakeFs();
    fs.files.set("p.md", md("# P", "", "## G", "", "group **intro**", "", "- [ ] a 📅 2026-01-02 ^a", "	note", "- [ ] b 📅 2026-01-02 ^b"));
    const store = new ProjectStore(fs, S);
    await store.open("p.md");
    const notes = Object.fromEntries(store.state!.plan.rows.map(r => [r.id, r.notes]));
    expect(notes.a).toBe("note");
    expect(notes.b).toBeUndefined();
    expect(store.state!.plan.rows.find(r => r.text === "G")!.notes).toBe("group **intro**");
  });

  it("applies an edit and reparses", async () => {
    const fs = new FakeFs();
    fs.files.set("p.md", md("# P", "- [ ] a 📅 2026-01-02 ^a"));
    const store = new ProjectStore(fs, S);
    await store.open("p.md");
    const task = store.state!.project.groups[0].tasks[0];
    await store.apply([task], lines => edits.setProgress(lines, task, 0.3));
    expect(fs.files.get("p.md")).toContain("🚴 30%");
    expect(store.state!.plan.rows.find(r => r.id === "a")!.progress).toBeCloseTo(0.3);
  });

  it("refuses an edit when the file changed behind its back", async () => {
    const fs = new FakeFs();
    fs.files.set("p.md", md("# P", "- [ ] a 📅 2026-01-02 ^a"));
    const store = new ProjectStore(fs, S);
    await store.open("p.md");
    const task = store.state!.project.groups[0].tasks[0];
    fs.files.set("p.md", md("# P", "- [ ] a renamed elsewhere 📅 2026-01-02 ^a")); // no watcher event yet
    await expect(store.apply([task], lines => edits.setProgress(lines, task, 0.3))).rejects.toBeInstanceOf(StaleEditError);
    expect(fs.files.get("p.md")).not.toContain("🚴");
    expect(store.state!.project.groups[0].tasks[0].description).toBe("a renamed elsewhere");
  });

  it("reloads on external change but ignores its own writes", async () => {
    const fs = new FakeFs();
    fs.files.set("p.md", md("# P", "- [ ] a 📅 2026-01-02 ^a"));
    const store = new ProjectStore(fs, S);
    let notifications = 0;
    store.subscribe(() => notifications++);
    await store.open("p.md");
    const before = notifications;
    fs.external("p.md", fs.files.get("p.md")!); // same content = our own echo
    await new Promise(r => setTimeout(r, 0));
    expect(notifications).toBe(before);
    fs.external("p.md", md("# P", "- [ ] b 📅 2026-01-02 ^b"));
    await new Promise(r => setTimeout(r, 0));
    expect(store.state!.plan.rows.map(r => r.id)).toContain("b");
  });
});

describe("adding a milestone", () => {
  it("writes #milestone with 📅 only, no ⏳", async () => {
    const { lines, id } = edits.addTask(["# P", "- [ ] a ^a"], 0, "Релиз #milestone", null, "2026-11-16");
    expect(lines[2]).toBe(`- [ ] Релиз #milestone 📅 2026-11-16 ^${id}`);
    const plan = mapProject(await parseProject(lines.join("\n"), "p.md", S));
    expect(plan.rows.find(r => r.id === id)).toMatchObject({ kind: "milestone", start: "2026-11-16", end: "2026-11-16" });
  });

  it("works for a subtask too", () => {
    const { lines, id } = edits.addSubtask(["- [ ] parent ^p"], 0, "Сдача #milestone", null, "2026-11-20");
    expect(lines[1]).toBe(`\t- [ ] Сдача #milestone 📅 2026-11-20 ^${id}`);
  });
});

describe("adding a group", () => {
  it("appends a sub-heading after the parent's subgroups, keeping the --- style", () => {
    const src = ["# P", "", "---", "## A", "- [ ] a ^a", "", "---", "## B", "### B1", "- [ ] b ^b", "", ""];
    expect(edits.addGroup(src, 0, "New")).toEqual([...src.slice(0, 10), "", "---", "## New", "", ""]);
  });

  it("lands before the next sibling and its --- separator", () => {
    const src = ["# P", "## A", "- [ ] a ^a", "", "---", "## B"];
    expect(edits.addGroup(src, 1, "A1")).toEqual(["# P", "## A", "- [ ] a ^a", "", "### A1", "", "---", "## B"]);
  });

  it("refuses to go deeper than ######", () => {
    expect(edits.addGroup(["###### deep"], 0, "x")).toEqual(["###### deep"]);
  });

  it("shows a bare heading as an empty group, but not one with notes", async () => {
    const plan = mapProject(await parseProject(md("# P", "## Work", "- [ ] a ⏳ 2026-01-01 📅 2026-01-02 ^a", "## Notes", "text", "---", "## New", ""), "p.md", S));
    expect(plan.rows.map(r => r.text)).toEqual(["P", "Work", "a", "New"]);
    const root = plan.rows[0];
    expect([root.start, root.end]).toEqual(["2026-01-01", "2026-01-02"]);
    expect(plan.rows[3].progress).toBe(0);
  });
});

describe("deleting a group", () => {
  const file = ["# P", "", "---", "## A", "- [ ] a ^a", "", "---", "## B", "note", "### B1", "- [ ] b ^b", "\t- [ ] b2 ^b2", "", "---", "## C", "- [ ] c ⛔ ^b2 ^c"];
  const group = (line: number, level: number, heading: string) => ({ heading, level, number: "", tasks: [], subgroups: [], filePath: "p.md", lineNumber: line, hasContent: true });

  it("removes the section with its sub-headings, the --- above it, and refs to its tasks", () => {
    expect(edits.deleteGroup(file, group(7, 2, "B"), ["b", "b2"])).toEqual(
      ["# P", "", "---", "## A", "- [ ] a ^a", "", "---", "## C", "- [ ] c ^c"]);
  });

  it("counts notes and outside refs", () => {
    expect(edits.groupDeleteInfo(file, group(7, 2, "B"), ["b", "b2"])).toEqual({ notes: 1, refs: 1 });
  });

  it("works for the last section and a sub-heading", () => {
    expect(edits.deleteGroup(file, group(14, 2, "C"), ["c"])).toEqual(file.slice(0, 12));
    expect(edits.deleteGroup(file, group(9, 3, "B1"), ["b", "b2"])).toEqual([...file.slice(0, 9), "", "---", "## C", "- [ ] c ^c"]);
  });
});
