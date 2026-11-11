import type { DocumentStorage } from "./document";
import { dirname, joinPath } from "./document";
import type { ParsedProject, Plan, PlannerSettings, TaskLine, TaskGroup } from "./types";
import { parseProject, allTasks, type EmbedResolver } from "./parser";
import { mapProject } from "./mapper";
import { ensureBlockIds, taskBody, groupIntro, type Lines } from "./edits";

export type Anchor = TaskLine | TaskGroup;
export interface StoreState {
  path: string;
  project: ParsedProject;
  plan: Plan;
  lines: string[];
  /** Exact version that an edit was prepared against. */
  content: string;
}
export class StaleEditError extends Error {
  constructor() { super("Файл изменился — правка отменена, проект перечитан"); }
}

/** One store per view. Serialize asynchronous reads, edits and reloads. */
export class ProjectStore {
  private content = "";
  private unwatch: (() => void) | null = null;
  private listeners = new Set<(s: StoreState) => void>();
  private errorListeners = new Set<(error: unknown) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private watchedPaths = new Set<string>();
  state: StoreState | null = null;
  constructor(private fs: DocumentStorage, readonly settings: PlannerSettings) {}
  subscribe(cb: (s: StoreState) => void): () => void {
    this.listeners.add(cb);
    if (this.state) cb(this.state);
    return () => this.listeners.delete(cb);
  }
  onError(cb: (error: unknown) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }
  async open(path: string): Promise<void> {
    this.close();
    const generation = this.generation;
    await this.enqueue(async () => {
      if (generation === this.generation) await this.load(path, generation);
    });
  }
  close(): void {
    this.generation++;
    this.unwatch?.();
    this.unwatch = null;
    this.state = null;
    this.watchedPaths.clear();
  }
  refresh(): Promise<void> {
    const path = this.state?.path;
    const generation = this.generation;
    return this.enqueue(async () => {
      if (path && generation === this.generation) await this.load(path, generation);
    });
  }
  private watchChange(path: string, changed: string, generation: number, force = false): void {
    void this.enqueue(async () => {
      if (generation !== this.generation) return;
      const fresh = await this.fs.readText(path);
      if (!force && changed === path && fresh === this.content) return;
      await this.load(path, generation, fresh);
    }).catch(error => this.errorListeners.forEach(cb => cb(error)));
  }
  private async update(path: string, expected: string, transform: (text: string) => string): Promise<string> {
    const checked = (fresh: string) => {
      if (fresh !== expected) throw new StaleEditError();
      return transform(fresh);
    };
    if (this.fs.updateText) return this.fs.updateText(path, checked);
    // Hosts without an atomic primitive retain the original optimistic check.
    const fresh = await this.fs.readText(path);
    const next = checked(fresh);
    if (next !== fresh) await this.fs.writeText(path, next);
    return next;
  }
  private async load(path: string, generation: number, known?: string): Promise<void> {
    let content = known ?? await this.fs.readText(path);
    const dependencies = new Set([path]);
    const resolver = this.embedResolver(dependencies);
    let project = await parseProject(content, path, this.settings, resolver);
    if (generation !== this.generation) return;
    const tasks = allTasks(project).filter(t => t.filePath === path);
    if (tasks.some(t => !t.hasBlockId)) {
      const eol = content.includes("\r\n") ? "\r\n" : "\n";
      try {
        content = await this.update(path, content, text => ensureBlockIds(split(text), tasks).join(eol));
      } catch (error) {
        if (error instanceof StaleEditError) content = await this.fs.readText(path);
        else throw error;
      }
      project = await parseProject(content, path, this.settings, resolver);
    }
    const plan = mapProject(project, await this.externalIndex(project, dependencies));
    if (generation !== this.generation) return;
    const lines = split(content);
    for (const row of plan.rows) {
      const notes = row.task ? (row.task.filePath === path ? taskBody(lines, row.task) : "")
        : row.group?.filePath === path ? groupIntro(lines, row.group) : "";
      if (notes.trim()) row.notes = notes;
    }
    if (!samePaths(this.watchedPaths, dependencies)) {
      this.unwatch?.();
      this.unwatch = null;
      const stops: (() => void)[] = [];
      try {
        for (const dependency of dependencies) stops.push(await this.fs.watch(dependency, force => this.watchChange(path, dependency, generation, force)));
      } catch (error) {
        stops.forEach(stop => stop()); this.watchedPaths.clear(); throw error;
      }
      if (generation !== this.generation) { stops.forEach(stop => stop()); return; }
      this.unwatch = () => stops.forEach(stop => stop());
      this.watchedPaths = dependencies;
    }
    this.content = content;
    this.state = { path, project, plan, lines, content };
    this.listeners.forEach(cb => cb(this.state!));
  }
  apply(anchors: Anchor[], edit: (lines: Lines) => Lines, expected = this.state?.content): Promise<void> {
    const path = this.state?.path;
    const generation = this.generation;
    return this.enqueue(async () => {
      if (!path || expected === undefined || generation !== this.generation) return;
      try {
        const next = await this.update(path, expected, fresh => {
          const lines = split(fresh);
          if (anchors.some(a => a.filePath !== path || !anchorMatches(lines, a))) throw new StaleEditError();
          return edit(lines).join(fresh.includes("\r\n") ? "\r\n" : "\n");
        });
        await this.load(path, generation, next);
      } catch (error) {
        if (error instanceof StaleEditError) await this.load(path, generation);
        throw error;
      }
    });
  }
  private async resolveLink(name: string, fromPath: string): Promise<string | null> {
    if (this.fs.resolveLink) return this.fs.resolveLink(name, fromPath);
    return joinPath(dirname(fromPath), name.endsWith(".md") ? name : `${name}.md`);
  }
  private embedResolver(dependencies: Set<string>): EmbedResolver {
    return async (name, fromPath) => {
      const path = await this.resolveLink(name, fromPath);
      if (!path || !await this.fs.exists(path)) return null;
      dependencies.add(path);
      return { path, content: await this.fs.readText(path) };
    };
  }
  private async externalIndex(project: ParsedProject, dependencies: Set<string>): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    const files = new Set(allTasks(project).flatMap(t => t.dependsOn).flatMap(d => d.type === "remote" ? [d.file] : []));
    for (const name of files) {
      const path = await this.resolveLink(name, project.filePath);
      if (!path || !await this.fs.exists(path)) continue;
      dependencies.add(path);
      const ext = await parseProject(await this.fs.readText(path), path, this.settings);
      for (const t of allTasks(ext)) if (t.hasBlockId) index.set(`${name}#${t.id}`, t.id);
    }
    return index;
  }
}
function split(content: string): string[] { return content.replace(/\r\n/g, "\n").split("\n"); }
function anchorMatches(lines: Lines, a: Anchor): boolean {
  return "raw" in a ? lines[a.lineNumber] === a.raw
    : (lines[a.lineNumber] ?? "").replace(/^#{1,6} /, "").trim() === a.heading;
}
function samePaths(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(path => b.has(path));
}
