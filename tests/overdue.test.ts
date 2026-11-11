import { describe, it, expect } from "vitest";
import { parseProject } from "../src/core/parser";
import { mapProject } from "../src/core/mapper";
import { DEFAULT_SETTINGS } from "../src/core/types";
import { isOverdue, overdueCss, statusCss } from "../src/ui/svarAdapter";

const plan = async () => mapProject(await parseProject([
  "# P",
  "- [ ] late ⏳ 2026-10-01 📅 2026-10-20 ^late",
  "- [ ] due today ⏳ 2026-10-01 📅 2026-10-21 ^today",
  "- [x] done late ⏳ 2026-10-01 📅 2026-10-02 ✅ 2026-10-05 ^done",
  "- [ ] no due ⏳ 2026-10-01 ^nodue",
  "\t- [ ] inherits parent span ^child",
  "- [ ] ship #milestone 📅 2026-10-10 ^ms",
  "- [x] shipped #milestone 📅 2026-10-03 ✅ 2026-10-03 ^msdone",
  "- [-] dropped ⏳ 2026-10-01 📅 2026-10-02 ^gone",
  "- [-] dropped ms #milestone 📅 2026-10-04 ^msgone",
].join("\n"), "p.md", DEFAULT_SETTINGS));

describe("overdue bars", () => {
  it("only open tasks whose own 📅 is before today", async () => {
    const overdue = (await plan()).rows.filter(r => isOverdue(r, "2026-10-21")).map(r => r.id);
    expect(overdue).toEqual(["late", "ms"]);
  });

  it("outlines them by data-id: bars and the milestone diamond", async () => {
    const css = overdueCss(await plan(), "2026-10-21");
    expect(css).toContain(`.wx-bar[data-id=":late"]:not(.wx-milestone)`);
    expect(css).toContain(`.wx-bar.wx-milestone[data-id=":ms"] .wx-content`);
    expect(css).not.toContain(":today");
    expect(css).toMatch(/outline: 2px solid/);
    expect(overdueCss(await plan(), "2026-10-01")).toBe("");
  });
});

describe("status css", () => {
  it("colours done and cancelled diamonds, strikes cancelled grid rows", async () => {
    const css = statusCss(await plan(), { done: "#00ff00", cancelled: "#999999" }).split("\n");
    expect(css).toEqual([
      `.pp-gantt .wx-bar.wx-milestone[data-id=":msdone"] .wx-content { background-color: #00ff00; border-color: #00ff00; }`,
      `.pp-gantt .wx-bar.wx-milestone[data-id=":msgone"] .wx-content { background-color: #999999; border-color: #999999; }`,
      `.pp-gantt .wx-row[data-id=":gone"] .wx-cell,`,
      `.pp-gantt .wx-row[data-id=":msgone"] .wx-cell { color: #9ca3af; text-decoration: line-through; }`,
    ]);
  });

  it("cancelled tasks are not overdue and don't count in progress", async () => {
    const p = await plan();
    expect(p.rows.filter(r => r.cancelled).map(r => r.id)).toEqual(["gone", "msgone"]);
    // 2 done of 7 live tasks (incl. the subtask): the two cancelled ones are left out
    expect(p.rows.find(r => r.kind === "root")!.progress).toBeCloseTo(2 / 7);
  });
});
