import { describe, it, expect } from "vitest";
import {
  CREATED_EMOJI, START_EMOJI, SCHEDULED_EMOJI, DUE_EMOJI,
  PRIORITY_HIGHEST, PRIORITY_HIGH, PRIORITY_MEDIUM, PRIORITY_LOW, PRIORITY_LOWEST,
  hasField, getDateField, setDateField, getPriority, setPriority, nextPriority,
  shiftDate,
} from "../src/core/taskLineEditor";

const WEEKEND = [0, 6];

describe("date fields", () => {
  it("appends a date to a bare task", () => {
    expect(setDateField("- [ ] Write docs", DUE_EMOJI, "2026-08-27"))
      .toBe("- [ ] Write docs 📅 2026-08-27");
  });

  it("keeps the canonical order ➕ 🛫 ⏳ 📅 when inserting", () => {
    const line = "- [ ] Write docs 📅 2026-09-01";
    expect(setDateField(line, CREATED_EMOJI, "2026-08-27"))
      .toBe("- [ ] Write docs ➕ 2026-08-27 📅 2026-09-01");
  });

  it("inserts 🛫 between ➕ and ⏳ rather than at the end", () => {
    const line = "- [ ] Write docs ➕ 2026-08-01 ⏳ 2026-08-10 📅 2026-09-01";
    expect(setDateField(line, START_EMOJI, "2026-08-05"))
      .toBe("- [ ] Write docs ➕ 2026-08-01 🛫 2026-08-05 ⏳ 2026-08-10 📅 2026-09-01");
  });

  it("replaces an existing date in place", () => {
    const line = "- [ ] Write docs ⏳ 2026-08-27 📅 2026-09-01";
    expect(setDateField(line, SCHEDULED_EMOJI, "2026-08-28"))
      .toBe("- [ ] Write docs ⏳ 2026-08-28 📅 2026-09-01");
  });

  it("keeps the block id last", () => {
    const line = "- [ ] Write docs 📅 2026-09-01 ^task-001";
    expect(setDateField(line, CREATED_EMOJI, "2026-08-27"))
      .toBe("- [ ] Write docs ➕ 2026-08-27 📅 2026-09-01 ^task-001");
  });

  it("preserves indentation and unknown tokens", () => {
    const line = "  - [ ] 1.1 | Write docs #critical 🔁 every week ^task-001";
    expect(setDateField(line, DUE_EMOJI, "2026-09-01"))
      .toBe("  - [ ] 1.1 | Write docs #critical 🔁 every week 📅 2026-09-01 ^task-001");
  });

  it("is idempotent when applied twice with the same value", () => {
    const once = setDateField("- [ ] Write docs", DUE_EMOJI, "2026-09-01");
    expect(setDateField(once, DUE_EMOJI, "2026-09-01")).toBe(once);
  });

  it("reads dates back, ignoring the block id", () => {
    const line = "- [ ] Write docs ⏳ 2026-08-27 ^task-001";
    expect(getDateField(line, SCHEDULED_EMOJI)).toBe("2026-08-27");
    expect(getDateField(line, DUE_EMOJI)).toBeNull();
    expect(hasField(line, SCHEDULED_EMOJI)).toBe(true);
    expect(hasField(line, DUE_EMOJI)).toBe(false);
  });
});

describe("priority", () => {
  it("cycles downwards and wraps around", () => {
    expect(nextPriority(null)).toBe(PRIORITY_HIGHEST);
    expect(nextPriority(PRIORITY_HIGHEST)).toBe(PRIORITY_HIGH);
    expect(nextPriority(PRIORITY_HIGH)).toBe(PRIORITY_MEDIUM);
    expect(nextPriority(PRIORITY_MEDIUM)).toBe(PRIORITY_LOW);
    expect(nextPriority(PRIORITY_LOW)).toBe(PRIORITY_LOWEST);
    expect(nextPriority(PRIORITY_LOWEST)).toBe(PRIORITY_HIGHEST);
  });

  it("places the priority before the dates", () => {
    const line = "- [ ] Write docs ➕ 2026-08-27 📅 2026-09-01 ^task-001";
    expect(setPriority(line, PRIORITY_HIGH))
      .toBe("- [ ] Write docs ⏫ ➕ 2026-08-27 📅 2026-09-01 ^task-001");
  });

  it("replaces an existing priority without duplicating it", () => {
    const line = "- [ ] Write docs 🔺 ➕ 2026-08-27";
    const next = setPriority(line, nextPriority(getPriority(line)));
    expect(next).toBe("- [ ] Write docs ⏫ ➕ 2026-08-27");
    expect(getPriority(next)).toBe(PRIORITY_HIGH);
  });

  it("clears the priority when passed null", () => {
    const line = "- [ ] Write docs 🔽 📅 2026-09-01 ^task-001";
    expect(setPriority(line, null))
      .toBe("- [ ] Write docs 📅 2026-09-01 ^task-001");
  });

  it("survives a full round trip through the cycle", () => {
    // 5 presses walk 🔺 ⏫ 🔼 🔽 ⏬, the 6th wraps back to the top
    let line = "- [ ] Write docs 📅 2026-09-01 ^task-001";
    for (let i = 0; i < 5; i++) {
      line = setPriority(line, nextPriority(getPriority(line)));
    }
    expect(line).toBe("- [ ] Write docs ⏬ 📅 2026-09-01 ^task-001");
    line = setPriority(line, nextPriority(getPriority(line)));
    expect(line).toBe("- [ ] Write docs 🔺 📅 2026-09-01 ^task-001");
  });
});

describe("shiftDate", () => {
  it("moves by calendar days when working days are not enforced", () => {
    // 2026-08-28 is a Friday
    expect(shiftDate("2026-08-28", 1, false, WEEKEND)).toBe("2026-08-29");
  });

  it("steps over the weekend when working days are enforced", () => {
    expect(shiftDate("2026-08-28", 1, true, WEEKEND)).toBe("2026-08-31");
  });

  it("steps over a custom weekend", () => {
    // Friday+Saturday weekend: Thursday 2026-08-27 → Sunday 2026-08-30
    expect(shiftDate("2026-08-27", 1, true, [5, 6])).toBe("2026-08-30");
  });

  it("crosses month boundaries", () => {
    expect(shiftDate("2026-08-31", 1, false, WEEKEND)).toBe("2026-09-01");
  });

  it("falls back to calendar days if every day is a weekend", () => {
    expect(shiftDate("2026-08-28", 1, true, [0, 1, 2, 3, 4, 5, 6])).toBe("2026-08-29");
  });

  it("returns the input unchanged when it is not an ISO date", () => {
    expect(shiftDate("tomorrow", 1, false, WEEKEND)).toBe("tomorrow");
  });
});
