import { describe, it, expect } from "vitest";
import { ProjectStore, StaleEditError } from "../src/core/store";
import { DEFAULT_SETTINGS } from "../src/core/types";
import { renameTask } from "../src/core/edits";
import type { DocumentStorage } from "../src/core/document";

const source = "# Plan\r\n- [ ] Original 📅 2026-11-12 ^a\r\n";
class Storage implements DocumentStorage {
  files = new Map([["plan.md", source]]);
  watchers = new Map<string, Set<(force?: boolean) => void>>();
  beforeUpdate: (() => void) | null = null;
  async readText(path: string) {
    const text = this.files.get(path);
    if (text === undefined) throw new Error("Missing file");
    return text;
  }
  async exists(path: string) { return this.files.has(path); }
  async writeText(path: string, text: string) { this.files.set(path, text); }
  async updateText(path: string, update: (text: string) => string) {
    this.beforeUpdate?.(); this.beforeUpdate = null;
    const next = update(this.files.get(path)!);
    this.files.set(path, next);
    this.watchers.get(path)?.forEach(cb => cb());
    return next;
  }
  async watch(path: string, cb: (force?: boolean) => void) {
    const callbacks = this.watchers.get(path) ?? new Set();
    this.watchers.set(path, callbacks); callbacks.add(cb);
    return () => { callbacks.delete(cb); };
  }
  async resolveLink(name: string) { return name === "Child" ? "other/child.md" : null; }
}
function setup(storage = new Storage()) {
  return { storage, store: new ProjectStore(storage, DEFAULT_SETTINGS) };
}
function task(store: ProjectStore) { return store.state!.plan.rows.find(r => r.id === "a")!.task!; }

describe("store concurrency and lifecycle", () => {
  it("checks the exact source inside the host's atomic update", async () => {
    const { storage, store } = setup(); await store.open("plan.md");
    const anchor = task(store);
    storage.beforeUpdate = () => storage.files.set("plan.md", source + "External note\r\n");
    await expect(store.apply([anchor], lines => renameTask(lines, anchor, "Changed"))).rejects.toBeInstanceOf(StaleEditError);
    expect(storage.files.get("plan.md")).toBe(source + "External note\r\n");
    expect(store.state!.lines).toContain("External note"); store.close();
  });
  it("rejects the losing edit from a second view of the same document", async () => {
    const storage = new Storage();
    const a = setup(storage).store, b = setup(storage).store;
    await a.open("plan.md"); await b.open("plan.md");
    const ta = task(a), tb = task(b);
    const results = await Promise.allSettled([
      a.apply([ta], lines => renameTask(lines, ta, "First")),
      b.apply([tb], lines => renameTask(lines, tb, "Second")),
    ]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(storage.files.get("plan.md")).toContain("First"); a.close(); b.close();
  });
  it("rejects queued edits prepared against an earlier version", async () => {
    const { storage, store } = setup(); await store.open("plan.md");
    const anchor = task(store);
    const result = await Promise.allSettled([
      store.apply([anchor], lines => renameTask(lines, anchor, "First")),
      store.apply([anchor], lines => renameTask(lines, anchor, "Second")),
    ]);
    expect(result.map(r => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(storage.files.get("plan.md")).toContain("First"); store.close();
  });
  it("uses a caller-supplied snapshot for edits from a long-lived dialog", async () => {
    const { store } = setup(); await store.open("plan.md");
    const old = store.state!.content;
    const anchor = task(store);
    await store.apply([anchor], lines => renameTask(lines, anchor, "New"));
    await expect(store.apply([], lines => [...lines, "stale dialog"], old)).rejects.toBeInstanceOf(StaleEditError);
    store.close();
  });
  it("resolves and watches embeds outside the current directory", async () => {
    const { storage, store } = setup();
    storage.files.set("plan.md", "# Plan\n![[Child]]");
    storage.files.set("other/child.md", "- [ ] Child 📅 2026-11-12 ^child");
    await store.open("plan.md");
    expect(store.state!.plan.rows.some(r => r.id === "child")).toBe(true);
    storage.files.set("other/child.md", "- [ ] Updated 📅 2026-11-12 ^child");
    storage.watchers.get("other/child.md")!.forEach(cb => cb());
    await store.refresh();
    expect(store.state!.plan.rows.find(r => r.id === "child")!.text).toContain("Updated");
    store.close();
    expect([...storage.watchers.values()].every(set => set.size === 0)).toBe(true);
  });
  it("does not publish or install watchers after being closed during a read", async () => {
    const { storage, store } = setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    const read = storage.readText.bind(storage);
    storage.readText = async path => { await gate; return read(path); };
    let notifications = 0; store.subscribe(() => notifications++);
    const opening = store.open("plan.md");
    await Promise.resolve(); store.close(); release(); await opening;
    expect(store.state).toBeNull(); expect(notifications).toBe(0);
    expect(storage.watchers.size).toBe(0);
  });
});
