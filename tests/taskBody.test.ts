import { describe, it, expect } from "vitest";
import { parseTaskLine } from "../src/core/parser";
import { taskBody, setTaskBody, groupIntro, setGroupIntro } from "../src/core/edits";
import { DEFAULT_SETTINGS } from "../src/core/types";

const at = (lines: string[], n: number) => parseTaskLine(lines[n], n, "p.md", DEFAULT_SETTINGS)!;

describe("task body", () => {
  const file = [
    "## G",
    "- [ ] Parent ^p",
    "\t- мысль 1",
    "\t- мысль 2 **важно**",
    "",
    "\t- [ ] Child ^c",
    "\t\tnote under child",
    "\t- после подзадачи",
    "- [ ] Next ^n",
  ];

  it("is the description: up to the first subtask, without the shared indent", () => {
    expect(taskBody(file, at(file, 1))).toBe("- мысль 1\n- мысль 2 **важно**");
  });

  it("subtasks and what follows them stay out", () => {
    const lines = ["- [ ] T ^t", "\t- [ ] sub ^s", "\tnote after sub"];
    expect(taskBody(lines, at(lines, 0))).toBe("");
    expect(taskBody(file, at(file, 8))).toBe("");
  });

  it("round-trips unchanged", () => {
    const t = at(file, 1);
    expect(setTaskBody(file, t, taskBody(file, t))).toEqual(file);
  });

  it("writes the description back before the subtasks, keeping the gap and the subtasks", () => {
    expect(setTaskBody(file, at(file, 1), "новая мысль\n\n")).toEqual([
      "## G", "- [ ] Parent ^p", "\tновая мысль", "", "\t- [ ] Child ^c", "\t\tnote under child", "\t- после подзадачи", "- [ ] Next ^n",
    ]);
  });

  it("an empty description leaves the subtasks right under the task", () => {
    expect(setTaskBody(file, at(file, 1), "")).toEqual([
      "## G", "- [ ] Parent ^p", "\t- [ ] Child ^c", "\t\tnote under child", "\t- после подзадачи", "- [ ] Next ^n",
    ]);
  });

  it("a new description lines up with the subtasks", () => {
    const lines = ["- [ ] T ^t", "    - [ ] sub ^s"];
    expect(setTaskBody(lines, at(lines, 0), "note")).toEqual(["- [ ] T ^t", "    note", "    - [ ] sub ^s"]);
  });

  it("adds a description to a task that had none, one level deeper", () => {
    const lines = ["## G", "\t- [ ] Nested ^x", "- [ ] Next ^n"];
    expect(setTaskBody(lines, at(lines, 1), "note")).toEqual(["## G", "\t- [ ] Nested ^x", "\t\tnote", "- [ ] Next ^n"]);
  });

  it("keeps a mixed-indent description nested", () => {
    const lines = ["- [ ] T ^t", "\tTab", "    spaces"];
    const t = at(lines, 0);
    expect(taskBody(lines, t)).toBe("\tTab\n    spaces");
    expect(setTaskBody(lines, t, "\tTab\nleft edge")).toEqual(["- [ ] T ^t", "\tTab", "\tleft edge"]);
  });
});

describe("group intro", () => {
  const group = (lines: string[], n: number) => ({
    heading: lines[n].replace(/^#+ /, ""), level: lines[n].match(/^#+/)![0].length,
    number: "", tasks: [], subgroups: [], filePath: "p.md", lineNumber: n, hasContent: true,
  });
  const file = ["# P", "", "## G", "", "Intro **text**", "", "more", "", "- [ ] T ^t", "", "## H", "no tasks", ""];

  it("reads the text before the first task, without blank lines around it", () => {
    expect(groupIntro(file, group(file, 2))).toBe("Intro **text**\n\nmore");
  });

  it("stops at a sub-heading when there are no tasks", () => {
    expect(groupIntro(file, group(file, 0))).toBe("");
    expect(groupIntro(file, group(file, 10))).toBe("no tasks");
  });

  it("writes the text set off by blank lines and keeps the tasks", () => {
    expect(setGroupIntro(file, group(file, 2), "new\n\n")).toEqual(["# P", "", "## G", "", "new", "", "- [ ] T ^t", "", "## H", "no tasks", ""]);
  });

  it("adds text to a heading followed right by a task", () => {
    const lines = ["## G", "- [ ] T ^t"];
    expect(setGroupIntro(lines, group(lines, 0), "note")).toEqual(["## G", "", "note", "", "- [ ] T ^t"]);
  });

  it("an empty text leaves one blank line before the tasks", () => {
    expect(setGroupIntro(file, group(file, 2), "")).toEqual(["# P", "", "## G", "", "- [ ] T ^t", "", "## H", "no tasks", ""]);
  });

  it("stops before an embedded task and a ---", () => {
    const lines = ["## G", "text", "![[Other]]", "## H", "x", "---", "## I"];
    expect(groupIntro(lines, group(lines, 0))).toBe("text");
    expect(groupIntro(lines, group(lines, 3))).toBe("x");
  });
});
