import { describe, it, expect } from "vitest";
import { parseTaskLine } from "../src/core/parser";
import { moveTaskInList, listMoves } from "../src/core/edits";
import { DEFAULT_SETTINGS } from "../src/core/types";

const at = (lines: string[], n: number) => parseTaskLine(lines[n], n, "p.md", DEFAULT_SETTINGS)!;

describe("move a task among its sibling tasks", () => {
  const file = [
    "## G",
    "- [ ] A ^a",
    "\tnote of A",
    "- [ ] B ^b",
    "\t- [ ] B1 ^b1",
    "- [ ] C ^c",
    "",
    "## H",
    "- [ ] D ^d",
  ];

  it("one step passes the neighbour with its notes and subtasks", () => {
    expect(moveTaskInList(file, at(file, 3), "up")).toEqual([
      "## G", "- [ ] B ^b", "\t- [ ] B1 ^b1", "- [ ] A ^a", "\tnote of A", "- [ ] C ^c", "", "## H", "- [ ] D ^d",
    ]);
    expect(moveTaskInList(file, at(file, 1), "down")).toEqual([
      "## G", "- [ ] B ^b", "\t- [ ] B1 ^b1", "- [ ] A ^a", "\tnote of A", "- [ ] C ^c", "", "## H", "- [ ] D ^d",
    ]);
  });

  it("top / bottom go to the edge of the run, not past the heading", () => {
    expect(moveTaskInList(file, at(file, 5), "top").slice(0, 3)).toEqual(["## G", "- [ ] C ^c", "- [ ] A ^a"]);
    expect(moveTaskInList(file, at(file, 1), "bottom")).toEqual([
      "## G", "- [ ] B ^b", "\t- [ ] B1 ^b1", "- [ ] C ^c", "- [ ] A ^a", "\tnote of A", "", "## H", "- [ ] D ^d",
    ]);
  });

  it("stays at the group's edge and inside its parent", () => {
    expect(moveTaskInList(file, at(file, 8), "up")).toBe(file);
    expect(moveTaskInList(file, at(file, 5), "down")).toBe(file);
    expect(moveTaskInList(file, at(file, 4), "up")).toBe(file); // only child of B
    expect(listMoves(file, at(file, 4))).toEqual({ up: false, down: false });
    expect(listMoves(file, at(file, 1))).toEqual({ up: false, down: true });
    expect(listMoves(file, at(file, 3))).toEqual({ up: true, down: true });
  });

  it("plain points are the parent's description: subtasks never go above them", () => {
    const lines = [
      "- [ ] задача 1 ^t",
      "\t- мысль 1",
      "\t- мысль 2",
      "\t- [ ] подзадача 1 ^s1",
      "\t- [ ] подзадача 2 ^s2",
    ];
    expect(moveTaskInList(lines, at(lines, 3), "up")).toBe(lines);
    expect(moveTaskInList(lines, at(lines, 4), "top")).toEqual([
      "- [ ] задача 1 ^t", "\t- мысль 1", "\t- мысль 2", "\t- [ ] подзадача 2 ^s2", "\t- [ ] подзадача 1 ^s1",
    ]);
    expect(listMoves(lines, at(lines, 3))).toEqual({ up: false, down: true });
  });

  it("a plain point between tasks splits the run", () => {
    const lines = ["## G", "- [ ] A ^a", "- point", "- [ ] B ^b"];
    expect(moveTaskInList(lines, at(lines, 3), "up")).toBe(lines);
    expect(listMoves(lines, at(lines, 1))).toEqual({ up: false, down: false });
  });
});
