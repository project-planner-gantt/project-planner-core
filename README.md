# Project Gantt Core

Shared Markdown planning logic and Gantt editor for **Project Gantt**, created by **bvn13**.

The package combines a TypeScript document engine with a Svelte 5 / SVAR Gantt interface. It is used by the [Obsidian plugin](https://gitea.bvn13.me/management/obsidian-project-planner-plugin) and the [Tauri desktop application](https://gitea.bvn13.me/management/project-planner-2).

The package name remains `@project-planner/core`. It is currently a private local package, not a published npm dependency.

## Responsibilities

- Parse Markdown projects, headings, tasks, dates, and dependencies.
- Map project documents to chart rows.
- Edit task lines, groups, ordering, nesting, and project settings.
- Track document and linked-file changes through host-provided storage.
- Detect stale edits and serialize updates within each store.
- Render the shared chart, task dialogs, stage filters, and settings.

Platform file dialogs, recent-file lists, and Obsidian workspace navigation belong to the host application. The current shared interface is in Russian.

## Development

Use Node.js and npm. The installed Vitest version supports Node.js `^22.12.0 || ^24.0.0 || >=26.0.0`; Node.js 24 satisfies this range.

```sh
npm ci
npm run check:core
npm run check
npm test
npm run build
```

| Command | Purpose |
| --- | --- |
| `check:core` | Type-check the TypeScript document engine |
| `check` | Check Svelte components and TypeScript |
| `test` | Run unit tests |
| `build` | Generate `dist/index.js` and declarations under `dist/types/` |

The root entry point does not import Svelte, the DOM, Tauri, or Obsidian. YAML frontmatter parsing uses `yaml`. UI components are exported as Svelte source for the consuming application's build pipeline.

Build definitions: [package.json](package.json), [tsconfig.build.json](tsconfig.build.json), and [vite.core.config.ts](vite.core.config.ts).

## Repository layout

The current applications use sibling checkouts:

```text
workspace/
  project-planner-core/
  project-planner-2/
  obsidian-project-planner-plugin/
```

Both consumers depend on `file:../project-planner-core`. Install and build this package first, then run `npm ci` in the consumer. Both use Vite with the Svelte plugin and `resolve.dedupe: ["svelte"]` to share a single Svelte runtime. Dependency versions are recorded in package manifests and lockfiles.

The original `project-planner` application is preserved separately and is not required to build these repositories.

## Package entry points

| Import | Contents |
| --- | --- |
| `@project-planner/core` | Built TypeScript engine and declarations |
| `@project-planner/core/core/*` | Individual TypeScript source modules for bundlers |
| `@project-planner/core/ui` | Shared `Planner.svelte` component |
| `@project-planner/core/ui/*` | UI helpers; use the `.svelte` suffix for component imports |
| `@project-planner/core/styles.css` | Shared styles scoped under `.pp-scope` |
| `@project-planner/core/fonts.css` | Local fonts and SVAR icons |

The exact export map is defined in [package.json](package.json).

## Host integration

Implement [DocumentStorage](src/core/document.ts) using your platform's document APIs:

```ts
export interface DocumentStorage {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  watch(path: string, onChange: (force?: boolean) => void): Promise<() => void>;
  updateText?(path: string, update: (fresh: string) => string): Promise<string>;
  resolveLink?(name: string, fromPath: string): Promise<string | null>;
}
```

`watch` returns a cleanup function. `resolveLink` supplies host-specific link resolution. If provided, `updateText` must apply its callback to fresh content within an atomic host operation. The Obsidian adapter uses `Vault.process`. Without this method, the store uses an optimistic read/check/write sequence that cannot guarantee atomicity between independent processes.

Create one `ProjectStore` per view, open the document, and pass the store to the shared component. For a browser/Svelte host:

```ts
import { mount, unmount } from "svelte";
import { ProjectStore, DEFAULT_SETTINGS, type DocumentStorage } from "@project-planner/core";
import Planner from "@project-planner/core/ui";
import "@project-planner/core/fonts.css";
import "@project-planner/core/styles.css";

async function openPlanner(target: HTMLElement, storage: DocumentStorage, path: string) {
  const store = new ProjectStore(storage, DEFAULT_SETTINGS);
  try {
    await store.open(path);
    const component = mount(Planner, { target, props: { store } });
    return async () => {
      store.close();
      await unmount(component);
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
```

Call the returned cleanup function when the host view closes.

The component accepts `toolbarStart`, `toolbarEnd`, and `empty` Svelte snippets for host-specific controls. Use `initialLayout` and `onlayoutchange` to restore and persist column widths and grid width. `onready` exposes the chart API and a callback to refresh the current-day marker.

Integration sources: [store](src/core/store.ts), [storage contract](src/core/document.ts), and [Planner component](src/ui/Planner.svelte).

## Document behavior

Documents use Markdown headings, checklist tasks, date markers, and block IDs. See [samples/demo-project.md](samples/demo-project.md) and [samples/external.md](samples/external.md).

Opening a document can write missing task block IDs (`^id`) back to the source. Stores preserve LF/CRLF line endings, watch project and linked documents, and reject edits based on stale snapshots. Task dialogs retain the snapshot against which they were opened.

Each view owns its store and interface state. Shared styles use `.pp-scope`; generated project colors are scoped to each planner instance.

## Tests and extraction baseline

The unit suite covers parsing, mapping, Markdown rendering, task and group edits, ordering and nesting, date/status behavior, and store conflict handling. Run it with `npm test`.

[source-baseline.json](source-baseline.json) records SHA-256 hashes of the original application's sources, tests, and samples at the start of extraction, including changes uncommitted at that time. It exists to verify that extraction preserved the original application. The original repository is not a runtime or build dependency.

## License

Copyright (c) 2026 bvn13. Distributed under the [Project Gantt No-Sale License 1.0](LICENSE).

Personal and commercial use, modification, and free redistribution are permitted. Selling copies or paid forks, paid software bundles containing the covered code, and paid hosted access require separate written permission from bvn13. Paid support, training, installation, and development services are permitted subject to the license conditions. Third-party components retain their own licenses.

This is a source-available project with restrictions on paid distribution, not an OSI-approved open-source license. The full license text governs.

<!-- docs-source: repository=https://gitea.bvn13.me/management/project-planner-core.git; branch=feature/project-gantt; commit=3e3f33ef4801bbe0f45cd30c8451361fbc99f646; tag=; path=README.md; dirty=true -->
