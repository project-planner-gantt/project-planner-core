# Общее ядро Project Gantt

`@project-planner/core` содержит независимую TypeScript-логику Markdown-планировщика и общий редактор диаграммы на Svelte 5 / SVAR Gantt. Его используют соседние репозитории `project-planner-2` и `obsidian-project-planner-plugin`. Исходный `project-planner` остаётся без изменений.

## Подготовка и проверки

Для разработки нужны Node.js и npm. Диапазон Node.js для используемого Vitest: `^22.12.0 || ^24.0.0 || >=26.0.0`.

```sh
npm ci
npm run check:core
npm run check
npm test
npm run build
```

`build` создаёт `dist/index.js` и декларации в `dist/types`. Корневая точка входа не импортирует Svelte, DOM, Tauri или Obsidian. Для разбора YAML используется пакет `yaml`.

## Подключение

Репозитории располагаются рядом:

```text
my/
  project-planner/                  # исходная версия, не изменяется
  project-planner-core/
  project-planner-2/
  obsidian-project-planner-plugin/
```

Потребители подключают пакет через `file:../project-planner-core`. Сначала выполните `npm ci` и `npm run build` в ядре, затем `npm ci` в потребителе. Для сборки интерфейса нужен Svelte-плагин сборщика; оба потребителя используют Vite с `resolve.dedupe: ["svelte"]`. Версии общих зависимостей зафиксированы в `package.json` и lock-файлах.

Основные точки входа:

| Импорт | Назначение |
| --- | --- |
| `@project-planner/core` | Собранное TypeScript-ядро |
| `@project-planner/core/core/*` | Исходные TypeScript-модули для сборщика |
| `@project-planner/core/ui` | Компонент `Planner.svelte` |
| `@project-planner/core/ui/*` | Общие компоненты и вспомогательные модули интерфейса |
| `@project-planner/core/styles.css` | Стили, ограниченные контейнером `.pp-scope` |
| `@project-planner/core/fonts.css` | Локальные шрифты и иконки SVAR |

## Границы ответственности

Оболочка создаёт `ProjectStore` с реализацией `DocumentStorage`, открывает документ и передаёт store компоненту `Planner`. При закрытии она закрывает store и размонтирует компонент. Кнопки оболочки передаются через snippets `toolbarStart`, `toolbarEnd` и `empty`; настройки размеров — через `initialLayout` и `onlayoutchange`.

`DocumentStorage` предоставляет чтение, запись, проверку существования и наблюдение. Необязательный `resolveLink` позволяет использовать правила ссылок конкретной среды. `updateText` выполняет проверку версии и изменение внутри атомарной операции хоста. При его отсутствии используется оптимистическая проверка перед записью; она не обеспечивает атомарность между независимыми процессами.

Store сериализует операции одного представления, отклоняет устаревшие правки, отслеживает связанные документы и сохраняет LF/CRLF. При открытии он добавляет отсутствующие `^id` задач в Markdown. Интерфейс хранит снимок документа для карточек и не сохраняет их поверх более свежей версии.

Источник истины: `src/core/document.ts`, `src/core/store.ts`, `src/ui/Planner.svelte`, `package.json`.

## Проверка исходного приложения

`source-baseline.json` содержит SHA-256 исходников, тестов и примеров `project-planner` на момент начала выделения. Он фиксирует в том числе незакоммиченные изменения исходной версии. Исходный репозиторий не является зависимостью сборки новых проектов.

<!-- docs-source: repository=https://gitea.bvn13.me/management/project-planner-core.git; branch=master; commit=unavailable; tag=; path=README.md; dirty=true -->
