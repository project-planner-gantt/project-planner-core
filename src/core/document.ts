/** Host-owned storage. Platform detection and dialogs belong to the shell. */
export interface DocumentStorage {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  watch(path: string, onChange: (force?: boolean) => void): Promise<() => void>;
  /** Atomic host operation when available, such as Obsidian Vault.process. */
  updateText?(path: string, update: (fresh: string) => string): Promise<string>;
  resolveLink?(name: string, fromPath: string): Promise<string | null>;
}
export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(0, i) : "";
}
export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}
