---
colors:
  todo: "#A8D5E2"
  in-progress: "#F6AE2D"
  done: "#6BBF59"
  blocked: "#E84855"
  milestone: "#9B5DE5"
  critical: "#E84855"
  group: "#7B8CDE"
markers:
  - date: 2026-11-16
    label: Релиз
    color: red
---

# Project Gantt — демо

- [ ] Kick-off #milestone 📅 2026-10-12 ^kickoff

## 1. Ядро

- [x] 1.1 | Перенос парсера из плагина 🛫 2026-10-12 📅 2026-10-16 ✅ 2026-10-16 ^core-parser
- [x] 1.2 | Правки строк как чистые функции 🛫 2026-10-14 📅 2026-10-17 ✅ 2026-10-17 ⛔ ^core-parser ^core-edits
- [ ] 1.3 | ProjectStore: read-modify-write + конфликты #in-progress 🛫 2026-10-17 📅 2026-10-23 🚴 40% ⛔ ^core-edits ^core-store
	- [ ] Детект собственных записей ⏳ 2026-10-19 📅 2026-10-20 ^store-self
	- [ ] Отмена правки при внешнем изменении ⏳ 2026-10-21 📅 2026-10-23 ^store-stale

## 2. Оболочка Tauri

- [ ] 2.1 | Установка Rust + MSVC #blocked ⏳ 2026-10-20 📅 2026-10-21 ^tauri-toolchain
- [ ] 2.2 | Окно, диалог открытия, fs-watcher #critical ⏳ 2026-10-22 📅 2026-10-28 ⛔ ^tauri-toolchain ^tauri-shell
- [ ] 2.3 | Сборка инсталлятора #stage2 ⏳ 2026-11-09 📅 2026-11-13 ⛔ ^tauri-shell ^tauri-bundle

## 3. UI на SVAR

### 3.1 Диаграмма

- [ ] 3.1.1 | Перетаскивание баров → файл #stage1 ⏳ 2026-10-19 📅 2026-10-24 ⛔ ^core-store ^ui-drag
- [ ] 3.1.2 | Связи рисованием #stage1 ⏳ 2026-10-26 📅 2026-10-29 ⛔ ^ui-drag ^ui-links
- [ ] 3.1.3 | Маркеры и «сегодня» #stage2 ⏳ 2026-10-26 📅 2026-10-27 ^ui-markers

### 3.2 Редактирование

- [ ] 3.2.1 | Диалог задачи #stage1 ⏳ 2026-10-28 📅 2026-11-03 ^ui-editor
- [ ] 3.2.2 | Фильтр по stage #stage2 ⏳ 2026-11-02 📅 2026-11-04 ^ui-stage

## 4. Выпуск

- [ ] Первая версия #milestone 📅 2026-11-16 ⛔ ^tauri-bundle ^release

## Заметки без задач

Этот заголовок не попадёт на диаграмму: в нём нет задач, только текст.
