import { expect, it } from "vitest";
import { parseProject } from "../src/core/parser";
import { mapProject } from "../src/core/mapper";
import { DEFAULT_SETTINGS } from "../src/core/types";
import { colorCss, statusCss, toSvar } from "../src/ui/svarAdapter";

it("critical outlines preserve each task's status fill, including blocked and finished tasks", async () => {
  const source = [
    "# Project",
    "- [ ] normal #critical ^normal",
    "- [ ] working #critical #in-progress ^working",
    "- [ ] blocked #critical #blocked ^blocked",
    "- [x] done #critical ^done",
    "- [-] cancelled #critical ^cancelled",
    "- [ ] ship #critical #milestone ^ship",
  ].join("\n");
  const plan = mapProject(await parseProject(source, "p.md", DEFAULT_SETTINGS));
  const tasks = toSvar(plan, new Set()).tasks;
  for (const [id, type] of Object.entries({ normal: "task", working: "in-progress", blocked: "blocked", done: "done", cancelled: "cancelled", ship: "milestone" })) {
    expect(tasks.find(task => task.id === id)?.type).toBe(type);
  }
  const css = statusCss(plan, { critical: "#ff1234" });
  for (const id of ["normal", "working", "blocked"]) expect(css).toContain(`.wx-bar.wx-task[data-id=":${id}"]`);
  expect(css).toContain('.wx-bar.wx-milestone[data-id=":ship"] .wx-content');
  expect(css).toContain("outline: 2px solid #ff1234; outline-offset: 1px;");
  expect(css).not.toContain('data-id=":done"');
  expect(css).not.toContain('.wx-bar.wx-task[data-id=":cancelled"]');
  expect(colorCss()).not.toContain(".wx-task.critical");
});
