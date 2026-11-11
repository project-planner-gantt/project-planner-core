import { describe, it, expect } from "vitest";
import { moveTaskBlock, isListItem } from "../src/core/taskBlockMover";

const doc = (...lines: string[]) => lines;

/**
 * Move the block whose line contains `cursorOn`, and render the result back to
 * a lines array so expectations read like the document itself.
 */
function move(lines: string[], cursorOn: string, direction: "up" | "down") {
  const cursorLine = lines.findIndex((l) => l.includes(cursorOn));
  expect(cursorLine, `no line contains "${cursorOn}"`).toBeGreaterThanOrEqual(0);
  const result = moveTaskBlock(lines, cursorLine, direction);
  return result === null ? null : { lines: result.lines, cursorLine: result.cursorLine };
}

describe("isListItem", () => {
  it("accepts tasks and plain list items alike", () => {
    expect(isListItem("- [ ] Task")).toBe(true);
    expect(isListItem("- [x] Done task")).toBe(true);
    expect(isListItem("- point of view")).toBe(true);
    expect(isListItem("  - indented point")).toBe(true);
    expect(isListItem("* star point")).toBe(true);
    expect(isListItem("+ plus point")).toBe(true);
    expect(isListItem("1. ordered point")).toBe(true);
    expect(isListItem("2) ordered point")).toBe(true);
  });

  it("rejects everything that is not a list item", () => {
    expect(isListItem("")).toBe(false);
    expect(isListItem("   ")).toBe(false);
    expect(isListItem("## Heading")).toBe(false);
    expect(isListItem("just a paragraph")).toBe(false);
    expect(isListItem("-")).toBe(false);
    expect(isListItem("- ")).toBe(false);
    expect(isListItem("---")).toBe(false);
  });
});

describe("moving among sibling tasks", () => {
  it("swaps with the task above", () => {
    const result = move(doc("- [ ] A", "- [ ] B"), "B", "up");
    expect(result?.lines).toEqual(["- [ ] B", "- [ ] A"]);
    expect(result?.cursorLine).toBe(0);
  });

  it("swaps with the task below", () => {
    const result = move(doc("- [ ] A", "- [ ] B"), "A", "down");
    expect(result?.lines).toEqual(["- [ ] B", "- [ ] A"]);
    expect(result?.cursorLine).toBe(1);
  });

  it("carries the whole subtree along", () => {
    const result = move(
      doc("- [ ] A", "  - [ ] A1", "  - note under A", "- [ ] B"),
      "] A",
      "down"
    );
    expect(result?.lines).toEqual([
      "- [ ] B",
      "- [ ] A",
      "  - [ ] A1",
      "  - note under A",
    ]);
    expect(result?.cursorLine).toBe(1);
  });

  it("jumps over the neighbour's whole subtree, not just its first line", () => {
    const result = move(
      doc("- [ ] A", "- [ ] B", "  - [ ] B1", "  - [ ] B2"),
      "] A",
      "down"
    );
    expect(result?.lines).toEqual([
      "- [ ] B",
      "  - [ ] B1",
      "  - [ ] B2",
      "- [ ] A",
    ]);
    expect(result?.cursorLine).toBe(3);
  });
});

describe("plain list items count as neighbours", () => {
  it("jumps over a point above", () => {
    const result = move(
      doc("- [ ] A", "- point of view", "- [ ] B"),
      "] B",
      "up"
    );
    expect(result?.lines).toEqual(["- [ ] A", "- [ ] B", "- point of view"]);
    expect(result?.cursorLine).toBe(1);
  });

  it("jumps over a point below", () => {
    const result = move(
      doc("- [ ] A", "- point of view", "- [ ] B"),
      "] A",
      "down"
    );
    expect(result?.lines).toEqual(["- point of view", "- [ ] A", "- [ ] B"]);
    expect(result?.cursorLine).toBe(1);
  });

  it("jumps over a point together with its nested lines", () => {
    const result = move(
      doc(
        "- [ ] A",
        "- point of view",
        "  - sub point",
        "  - [ ] nested task",
        "- [ ] B"
      ),
      "] A",
      "down"
    );
    expect(result?.lines).toEqual([
      "- point of view",
      "  - sub point",
      "  - [ ] nested task",
      "- [ ] A",
      "- [ ] B",
    ]);
    expect(result?.cursorLine).toBe(3);
  });

  it("jumps over ordered and star markers too", () => {
    expect(move(doc("1. point", "- [ ] A"), "] A", "up")?.lines)
      .toEqual(["- [ ] A", "1. point"]);
    expect(move(doc("* point", "- [ ] A"), "] A", "up")?.lines)
      .toEqual(["- [ ] A", "* point"]);
  });

  it("moves through a run of several points", () => {
    const result = move(
      doc("- [ ] A", "- p1", "- p2", "- [ ] B"),
      "] B",
      "up"
    );
    // Lands directly above p2 — one sibling step, not a jump to the top.
    expect(result?.lines).toEqual(["- [ ] A", "- p1", "- [ ] B", "- p2"]);
    expect(result?.cursorLine).toBe(2);
  });
});

describe("plain list items can be moved themselves", () => {
  it("moves a point up over a task", () => {
    const result = move(doc("- [ ] A", "- point of view"), "point", "up");
    expect(result?.lines).toEqual(["- point of view", "- [ ] A"]);
    expect(result?.cursorLine).toBe(0);
  });

  it("moves a point down over a task and its subtree", () => {
    const result = move(
      doc("- point of view", "- [ ] A", "  - [ ] A1", "- [ ] B"),
      "point",
      "down"
    );
    expect(result?.lines).toEqual([
      "- [ ] A",
      "  - [ ] A1",
      "- point of view",
      "- [ ] B",
    ]);
    expect(result?.cursorLine).toBe(2);
  });

  it("moves a numbered item", () => {
    const result = move(doc("- [ ] A", "1. first", "2. second"), "2. second", "up");
    expect(result?.lines).toEqual(["- [ ] A", "1. second", "2. first"]);
    expect(result?.cursorLine).toBe(1);
  });

  it("carries the point's own subtree along", () => {
    const result = move(
      doc("- [ ] A", "- point of view", "  - sub point", "  - [ ] nested task"),
      "point of view",
      "up"
    );
    expect(result?.lines).toEqual([
      "- point of view",
      "  - sub point",
      "  - [ ] nested task",
      "- [ ] A",
    ]);
    expect(result?.cursorLine).toBe(0);
  });

  it("moves a nested point among its siblings", () => {
    const result = move(
      doc("- [ ] Parent", "  - [ ] C1", "  - a point", "- [ ] Other"),
      "a point",
      "up"
    );
    expect(result?.lines).toEqual([
      "- [ ] Parent",
      "  - a point",
      "  - [ ] C1",
      "- [ ] Other",
    ]);
    expect(result?.cursorLine).toBe(1);
  });

  it("respects the same boundaries as tasks", () => {
    expect(move(doc("## Section", "- point", "- [ ] A"), "- point", "up")).toBeNull();
    expect(move(doc("- [ ] A", "- point", "some prose"), "- point", "down")).toBeNull();
  });
});

describe("ordered lists keep their numbering", () => {
  it("does not shift the list when the second item goes first", () => {
    const result = move(doc("1. a", "2. b"), "b", "up");
    expect(result?.lines).toEqual(["1. b", "2. a"]);
    expect(result?.cursorLine).toBe(0);
  });

  it("does not shift the list when the first item goes last", () => {
    expect(move(doc("1. a", "2. b"), "a", "down")?.lines).toEqual(["1. b", "2. a"]);
  });

  it("renumbers a longer list by position", () => {
    expect(move(doc("1. a", "2. b", "3. c"), "c", "up")?.lines)
      .toEqual(["1. a", "2. c", "3. b"]);
    expect(move(doc("1. a", "2. b", "3. c"), "b", "down")?.lines)
      .toEqual(["1. a", "2. c", "3. b"]);
  });

  it("keeps each line's delimiter style", () => {
    expect(move(doc("1) a", "2) b"), "b", "up")?.lines).toEqual(["1) b", "2) a"]);
  });

  it("leaves a lazily numbered list alone", () => {
    expect(move(doc("1. a", "1. b"), "b", "up")?.lines).toEqual(["1. b", "1. a"]);
  });

  it("keeps numbering when the list starts at something other than 1", () => {
    expect(move(doc("5. a", "6. b"), "b", "up")?.lines).toEqual(["5. b", "6. a"]);
  });

  it("numbers only the items at the moved item's level", () => {
    const result = move(doc("1. a", "   1. a1", "2. b"), "2. b", "up");
    expect(result?.lines).toEqual(["1. b", "2. a", "   1. a1"]);
  });

  it("does not touch a numbered item that is not part of the run", () => {
    const result = move(
      doc("1. a", "2. b", "", "## Other", "", "1. x", "2. y"),
      "2. b",
      "up"
    );
    expect(result?.lines).toEqual([
      "1. b",
      "2. a",
      "",
      "## Other",
      "",
      "1. x",
      "2. y",
    ]);
  });

  it("does not renumber a mixed run beyond its own numbered items", () => {
    const result = move(doc("- point", "1. a"), "1. a", "up");
    expect(result?.lines).toEqual(["1. a", "- point"]);
  });

  it("keeps numbering when a numbered item carries a subtree", () => {
    const result = move(
      doc("1. a", "2. b", "   - note under b", "3. c"),
      "3. c",
      "up"
    );
    expect(result?.lines).toEqual([
      "1. a",
      "2. c",
      "3. b",
      "   - note under b",
    ]);
  });
});

describe("boundaries", () => {
  it("does not move past a heading", () => {
    expect(move(doc("## Section", "- [ ] A", "- [ ] B"), "] A", "up")).toBeNull();
  });

  it("does not move past a paragraph", () => {
    expect(move(doc("- [ ] A", "- [ ] B", "some prose"), "] B", "down")).toBeNull();
  });

  it("does not move past a bare dash", () => {
    expect(move(doc("-", "- [ ] A"), "] A", "up")).toBeNull();
  });

  it("does not move past the start or end of the file", () => {
    expect(move(doc("- [ ] A", "- [ ] B"), "] A", "up")).toBeNull();
    expect(move(doc("- [ ] A", "- [ ] B"), "] B", "down")).toBeNull();
  });

  it("refuses to move a line that is not a list item", () => {
    expect(move(doc("- [ ] A", "some prose", "- [ ] B"), "prose", "down")).toBeNull();
    expect(move(doc("## Heading", "- [ ] A"), "Heading", "down")).toBeNull();
    // Cursor on a bare dash (line 1) — a marker without content is not an item.
    expect(moveTaskBlock(doc("- [ ] A", "-", "- [ ] B"), 1, "up")).toBeNull();
  });

  it("keeps a child inside its parent (first and last child stay put)", () => {
    const lines = doc("- [ ] Parent", "  - [ ] C1", "  - [ ] C2", "- [ ] Other");
    expect(move(lines, "C1", "up")).toBeNull();
    expect(move(lines, "C2", "down")).toBeNull();
  });

  it("still reorders children inside their parent", () => {
    const lines = doc("- [ ] Parent", "  - [ ] C1", "  - [ ] C2", "- [ ] Other");
    const result = move(lines, "C2", "up");
    expect(result?.lines).toEqual([
      "- [ ] Parent",
      "  - [ ] C2",
      "  - [ ] C1",
      "- [ ] Other",
    ]);
    expect(result?.cursorLine).toBe(1);
  });
});

describe("blank lines", () => {
  // Documented current behaviour: a blank line is skipped over, not treated as
  // a hard boundary — the first non-empty line decides.
  it("moves across a blank line between siblings", () => {
    const result = move(doc("- [ ] A", "", "- [ ] B"), "] B", "up");
    expect(result?.lines).toEqual(["- [ ] B", "- [ ] A", ""]);
  });

  it("stops when the first non-empty line above is not a list item", () => {
    expect(move(doc("## Section", "", "- [ ] A", "- [ ] B"), "] A", "up")).toBeNull();
  });

  it("does not swallow a trailing blank line into the block", () => {
    const result = move(doc("- [ ] A", "- [ ] B", ""), "] A", "down");
    expect(result?.lines).toEqual(["- [ ] B", "- [ ] A", ""]);
  });
});
