import { describe, it, expect } from "vitest";
import { parseProject } from "../src/core/parser";
import { moveGroupInList } from "../src/core/edits";
import { DEFAULT_SETTINGS } from "../src/core/types";

const lines = [
  "# P", "intro", "", "---", "## A", "notes A", "- [ ] A ^a",
  "", "### A child", "- [ ] nested ^nested",
  "", "---", "## B", "- [ ] B ^b",
  "", "---", "## C", "- [ ] C ^c", "",
];
const parse = (text: string[]) => parseProject(text.join("\n"), "p.md", DEFAULT_SETTINGS);

describe("move groups among siblings", () => {
  it("moves the entire section and its separator in all four directions", async () => {
    const siblings = (await parse(lines)).groups[0].subgroups;
    for (const [index, direction, order] of [
      [1, "up", [1, 0, 2]], [1, "down", [0, 2, 1]],
      [2, "top", [2, 0, 1]], [0, "bottom", [1, 2, 0]],
    ] as const) {
      // The grid can pass a copied group rather than the parser's object.
      const moved = moveGroupInList(lines, structuredClone(siblings[index]), siblings, direction);
      const expected = [
        ...lines.slice(0, 2),
        ...order.flatMap(i => [lines.slice(2, 10), lines.slice(10, 14), lines.slice(14, 18)][i]),
        "",
      ];
      expect(moved).toEqual(expected);
      const groups = (await parse(moved)).groups[0].subgroups;
      expect(groups.map(g => g.heading)).toEqual(order.map(i => siblings[i].heading));
      expect(groups.find(g => g.heading === "A")!.subgroups[0].tasks[0].id).toBe("nested");
    }
  });

  it("stays inside the parent and leaves edge moves unchanged", async () => {
    const file = ["# P", "## A", "### X", "- [ ] X ^x", "", "---", "### Y", "- [ ] Y ^y", "", "---", "## B", "- [ ] B ^b"];
    const parent = (await parse(file)).groups[0].subgroups[0];
    const siblings = parent.subgroups;
    expect(moveGroupInList(file, siblings[0], siblings, "up")).toBe(file);
    expect(moveGroupInList(file, siblings[1], siblings, "bottom")).toBe(file);
    const moved = moveGroupInList(file, siblings[1], siblings, "top");
    const groups = (await parse(moved)).groups[0].subgroups;
    expect(groups.map(g => g.heading)).toEqual(["A", "B"]);
    expect(groups[0].subgroups.map(g => g.heading)).toEqual(["Y", "X"]);
    expect(moved.slice(-4)).toEqual(file.slice(-4));
  });
});
