// ─── Obsidian Tasks emoji fields ─────────────────────────────────────────────

export const PRIORITY_HIGHEST = "🔺";
export const PRIORITY_HIGH = "⏫";
export const PRIORITY_MEDIUM = "🔼";
export const PRIORITY_LOW = "🔽";
export const PRIORITY_LOWEST = "⏬";

export const CREATED_EMOJI = "➕";
export const START_EMOJI = "🛫";
export const SCHEDULED_EMOJI = "⏳";
export const DUE_EMOJI = "📅";
export const DONE_EMOJI = "✅";

/**
 * Priority levels in descending order, as offered by the Tasks plugin.
 * "Normal" (no emoji at all) is deliberately not part of the cycle — clearing a
 * priority is done by hand.
 */
export const PRIORITY_CYCLE = [
  PRIORITY_HIGHEST,
  PRIORITY_HIGH,
  PRIORITY_MEDIUM,
  PRIORITY_LOW,
  PRIORITY_LOWEST,
];

/** Canonical field order on a task line; `null` is the priority slot. */
const FIELD_ORDER: (string | null)[] = [
  null,
  CREATED_EMOJI,
  START_EMOJI,
  SCHEDULED_EMOJI,
  DUE_EMOJI,
  DONE_EMOJI,
];

const BLOCK_ID_RE = /\s+\^[\w-]+\s*$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ─── Line splitting ──────────────────────────────────────────────────────────

/** Split the trailing `^block-id` off, since it must always stay last. */
function splitBlockId(line: string): { body: string; blockId: string } {
  const match = line.match(BLOCK_ID_RE);
  if (!match || match.index === undefined) {
    return { body: line.replace(/\s+$/, ""), blockId: "" };
  }
  return {
    body: line.slice(0, match.index).replace(/\s+$/, ""),
    blockId: " " + match[0].trim(),
  };
}

function dateFieldRe(emoji: string): RegExp {
  return new RegExp(emoji + "\\s*(\\d{4}-\\d{2}-\\d{2})");
}

/**
 * Where a field belonging to `slot` should be inserted: right before the
 * left-most field that must come after it. -1 means "append at the end".
 */
function insertionPoint(body: string, slot: number): number {
  let point = -1;
  for (let i = slot + 1; i < FIELD_ORDER.length; i++) {
    const emoji = FIELD_ORDER[i];
    if (emoji === null) continue;
    const index = body.indexOf(emoji);
    if (index !== -1 && (point === -1 || index < point)) point = index;
  }
  return point;
}

function insertToken(body: string, token: string, slot: number): string {
  const point = insertionPoint(body, slot);
  if (point === -1) return `${body} ${token}`;
  const head = body.slice(0, point).replace(/\s+$/, "");
  const tail = body.slice(point);
  return `${head} ${token} ${tail}`;
}

// ─── Field access ────────────────────────────────────────────────────────────

/** True if the emoji is present at all, even without a well-formed date. */
export function hasField(line: string, emoji: string): boolean {
  return splitBlockId(line).body.includes(emoji);
}

/** The ISO date carried by `emoji`, or null if absent / unparseable. */
export function getDateField(line: string, emoji: string): string | null {
  const match = splitBlockId(line).body.match(dateFieldRe(emoji));
  return match ? match[1] : null;
}

/**
 * Set (or replace) a date field, keeping the canonical field order and leaving
 * every unrecognised token on the line untouched.
 */
export function setDateField(line: string, emoji: string, value: string): string {
  const { body, blockId } = splitBlockId(line);
  const re = dateFieldRe(emoji);
  if (re.test(body)) return body.replace(re, `${emoji} ${value}`) + blockId;
  return insertToken(body, `${emoji} ${value}`, FIELD_ORDER.indexOf(emoji)) + blockId;
}

export function getPriority(line: string): string | null {
  const { body } = splitBlockId(line);
  for (const priority of PRIORITY_CYCLE) {
    if (body.includes(priority)) return priority;
  }
  return null;
}

export function setPriority(line: string, priority: string | null): string {
  const { body, blockId } = splitBlockId(line);
  const current = getPriority(body);
  const stripped = current
    ? body.replace(new RegExp("\\s*" + current), "").replace(/\s+$/, "")
    : body;
  if (!priority) return stripped + blockId;
  return insertToken(stripped, priority, 0) + blockId;
}

/** Next level down the cycle; wraps around from lowest back to highest. */
export function nextPriority(current: string | null): string {
  if (!current) return PRIORITY_CYCLE[0];
  const index = PRIORITY_CYCLE.indexOf(current);
  if (index === -1) return PRIORITY_CYCLE[0];
  return PRIORITY_CYCLE[(index + 1) % PRIORITY_CYCLE.length];
}

// ─── Dates ───────────────────────────────────────────────────────────────────

function toIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function fromIso(iso: string): Date | null {
  const match = iso.match(ISO_DATE_RE);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isNaN(date.getTime()) ? null : date;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function plusDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/**
 * Move an ISO date by `days`. With `workingDaysOnly` the days listed in
 * `weekendDays` (0=Sun … 6=Sat) are stepped over rather than counted.
 */
export function shiftDate(
  iso: string,
  days: number,
  workingDaysOnly: boolean,
  weekendDays: number[]
): string {
  const date = fromIso(iso);
  if (!date || days === 0) return iso;

  const weekend = new Set((weekendDays ?? []).filter(n => n >= 0 && n <= 6));
  // With every day marked as a weekend there is no working day to land on.
  const skipWeekends = workingDaysOnly && weekend.size > 0 && weekend.size < 7;

  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    date.setDate(date.getDate() + step);
    if (skipWeekends && weekend.has(date.getDay())) continue;
    remaining--;
  }
  return toIso(date);
}
