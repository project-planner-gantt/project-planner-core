import { describe, it, expect } from "vitest";
import { parseTaskLine, parseProject, parseFrontmatter } from "../src/core/parser";
import { setStageTags } from "../src/core/edits";
import { setFrontmatterKey } from "../src/core/frontmatter";
import { DEFAULT_SETTINGS } from "../src/core/types";

const task = (raw: string) => parseTaskLine(raw, 0, "p.md", DEFAULT_SETTINGS)!;

describe("setStageTags", () => {
  it("puts stage tags after the description, before date fields", () => {
    const t = task("- [ ] 1.1 | Do it #urgent 🛫 2026-01-01 📅 2026-01-02 ^me");
    expect(setStageTags([t.raw], t, ["stage1", "stage3"])).toEqual(["- [ ] 1.1 | Do it #urgent #stage1 #stage3 🛫 2026-01-01 📅 2026-01-02 ^me"]);
  });

  it("replaces existing stage tags and keeps other tags", () => {
    const t = task("- [ ] x #stage1 #milestone 📅 2026-01-02 #stage2 ^me");
    expect(setStageTags([t.raw], t, ["stage2"])).toEqual(["- [ ] x #milestone #stage2 📅 2026-01-02 ^me"]);
  });

  it("removes all stage tags", () => {
    const t = task("- [ ] x #stage1 ⏳ 2026-01-02 ^me");
    expect(setStageTags([t.raw], t, [])).toEqual(["- [ ] x ⏳ 2026-01-02 ^me"]);
  });

  it("goes before the own id when there are no fields", () => {
    const t = task("- [ ] x ^me");
    expect(setStageTags([t.raw], t, ["stage1"])).toEqual(["- [ ] x #stage1 ^me"]);
  });
});

describe("setFrontmatterKey", () => {
  it("adds a key, keeping the rest of the yaml and comments", () => {
    const lines = ["---", "# palette", "colors:", "  done: \"#6BBF59\"", "---", "# P"];
    expect(setFrontmatterKey(lines, "stages", ["stage1", "stage2"])).toEqual(
      ["---", "# palette", "colors:", "  done: \"#6BBF59\"", "stages: [stage1, stage2]", "---", "# P"]);
  });

  it("replaces and removes a key", () => {
    const lines = ["---", "stages: [a]", "id: x", "---"];
    expect(setFrontmatterKey(lines, "stages", ["b"])).toEqual(["---", "stages: [b]", "id: x", "---"]);
    expect(setFrontmatterKey(lines, "stages", undefined)).toEqual(["---", "id: x", "---"]);
  });

  it("creates frontmatter when there is none", () => {
    expect(setFrontmatterKey(["# P"], "stages", ["s1"])).toEqual(["---", "stages: [s1]", "---", "# P"]);
  });

  it("round-trips through the parser", async () => {
    const lines = setFrontmatterKey(["# P", "- [ ] t ^a"], "stages", ["stage1"]);
    const p = await parseProject(lines.join("\n"), "p.md", DEFAULT_SETTINGS);
    expect(p.frontmatter.stages).toEqual(["stage1"]);
  });
});

describe("markers in frontmatter", () => {
  it("writes markers in block style with unquoted ISO dates and reads them back", async () => {
    const lines = setFrontmatterKey(["---", "stages: [stage1]", "---", "# P"], "markers", [
      { date: "2026-11-16", label: "Релиз", color: "red" },
      { date: "2026-12-01", label: "Демо", color: "#2f80ed" },
    ]);
    expect(lines).toEqual([
      "---",
      "stages: [stage1]",
      "markers:",
      "  - date: 2026-11-16",
      "    label: Релиз",
      "    color: red",
      "  - date: 2026-12-01",
      "    label: Демо",
      '    color: "#2f80ed"',
      "---",
      "# P",
    ]);
    const p = await parseProject(lines.join("\n"), "p.md", DEFAULT_SETTINGS);
    expect(p.frontmatter.markers).toEqual([
      { date: "2026-11-16", label: "Релиз", color: "red" },
      { date: "2026-12-01", label: "Демо", color: "#2f80ed" },
    ]);
  });
});

import { setMilestone, deleteTask, countDependents } from "../src/core/edits";

describe("setMilestone", () => {
  it("task → milestone: adds #milestone, drops ⏳/🛫, keeps 📅", () => {
    const t = task("- [ ] Релиз #stage1 🛫 2026-01-01 ⏳ 2026-01-02 📅 2026-01-05 ⛔ ^a ^me");
    expect(setMilestone([t.raw], t, true, "", "2026-01-07")).toEqual(["- [ ] Релиз #stage1 #milestone 📅 2026-01-07 ⛔ ^a ^me"]);
  });

  it("milestone → task: drops #milestone, adds ⏳ before 📅", () => {
    const t = task("- [ ] Релиз #milestone #stage1 📅 2026-01-07 ^me");
    expect(setMilestone([t.raw], t, false, "2026-01-03", "2026-01-07")).toEqual(["- [ ] Релиз #stage1 ⏳ 2026-01-03 📅 2026-01-07 ^me"]);
  });
});

describe("deleteTask", () => {
  const file = [
    "# P",
    "- [ ] parent ^p",
    "\t- [ ] child ^c",
    "\t\tnote under child",
    "- [ ] next ⛔ ^p ^n",
    "- [ ] other ⛔ ^c ⛔ ^keep ^o",
    "",
    "- [ ] after blank ^z",
  ];

  it("removes the task with its subtree and the refs to it", () => {
    const t = parseTaskLine(file[1], 1, "p.md", DEFAULT_SETTINGS)!;
    expect(countDependents(file, t, ["p", "c"])).toBe(2);
    expect(deleteTask(file, t, ["p", "c"])).toEqual([
      "# P",
      "- [ ] next ^n",
      "- [ ] other ⛔ ^keep ^o",
      "",
      "- [ ] after blank ^z",
    ]);
  });

  it("does not touch a similarly named id", () => {
    const lines = ["- [ ] a ^p", "- [ ] b ⛔ ^p2 ^b"];
    const t = parseTaskLine(lines[0], 0, "p.md", DEFAULT_SETTINGS)!;
    expect(deleteTask(lines, t, ["p"])).toEqual(["- [ ] b ⛔ ^p2 ^b"]);
  });
});

import { setTag } from "../src/core/edits";

describe("insertion after the description", () => {
  it("finds the first field even without a space before it", () => {
    const t = task("- [ ] аналитика⏳ 2026-10-14 📅 2026-10-30 ^me");
    expect(setStageTags([t.raw], t, ["stage-sa"])).toEqual(["- [ ] аналитика #stage-sa ⏳ 2026-10-14 📅 2026-10-30 ^me"]);
  });
});

describe("setTag", () => {
  it("puts special tags after the description and existing tags", () => {
    const t = task("- [ ] x #stage1 ⏳ 2026-01-01 📅 2026-01-02 ^me");
    const a = setTag([t.raw], t, "in-progress", true);
    expect(a).toEqual(["- [ ] x #stage1 #in-progress ⏳ 2026-01-01 📅 2026-01-02 ^me"]);
    expect(setTag(a, t, "critical", true)).toEqual(["- [ ] x #stage1 #in-progress #critical ⏳ 2026-01-01 📅 2026-01-02 ^me"]);
  });

  it("takes a tag off without touching look-alikes", () => {
    const t = task("- [ ] x #blocked #blocked-by-qa 📅 2026-01-02 ^me");
    expect(setTag([t.raw], t, "blocked", false)).toEqual(["- [ ] x #blocked-by-qa 📅 2026-01-02 ^me"]);
  });

  it("does not duplicate a tag already present", () => {
    const t = task("- [ ] x #critical 📅 2026-01-02 ^me");
    expect(setTag([t.raw], t, "critical", true)).toEqual(["- [ ] x #critical 📅 2026-01-02 ^me"]);
  });
});

describe("export-html in the frontmatter", () => {
  it("keeps a Windows path intact through write and parse", () => {
    const path = "C:\Users\User\Documents\plans\проект.html";
    const lines = setFrontmatterKey(["---", "stages: [stage1]", "---", "# P"], "export-html", path);
    expect(parseFrontmatter(lines).frontmatter["export-html"]).toBe(path);
    expect(lines).toContain(`export-html: ${path}`);
  });
});
