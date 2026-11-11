export type Language = "en" | "ru";
export type LanguagePreference = Language | "system";
export type Translate = (text: string) => string;
export function languagePreference(value: unknown): LanguagePreference {
  return value === "en" || value === "ru" ? value : "system";
}
export function resolveLanguage(preference: LanguagePreference, system = "en"): Language {
  return preference === "system" ? (system.toLowerCase().startsWith("ru") ? "ru" : "en") : preference;
}
const english: Record<string, string> = {
  "Проект": "Project", "Группа": "Group", "Веха": "Milestone", "Задача": "Task",
  "Связь": "Dependency", "Дата": "Date", "Старт": "Start", "Финиш": "Finish", "Дней": "Days",
  "Отменена": "Cancelled", "Выполнена": "Completed", "Прогресс": "Progress", "Этапы": "Stages", "Зависит от": "Depends on",
  "Новая группа": "New group", "Новая задача": "New task", "Заголовок": "Heading", "Описание": "Description",
  "— веха: без даты старта, только дата": "— milestone: a single date, no start date",
  "Статус": "Status", "(✅ сегодня)": "(✅ today)", "Строка": "Line",
  "Текст раздела до первой задачи (markdown)": "Section text before the first task (Markdown)",
  "Заметки и подзадачи под строкой задачи (markdown)": "Notes and subtasks below the task line (Markdown)",
  "Удалить…": "Delete…", "Вернуть": "Restore", "Отменить": "Cancel task", "Отмена": "Cancel", "Добавить": "Add", "Сохранить": "Save", "Удалить": "Delete",
  "Удалить группу?": "Delete group?", "Удалить задачу?": "Delete task?",
  "Заголовок «": "Heading “", "» будет удалён из файла вместе со всем своим разделом.": "” and its entire section will be removed from the file.",
  "Удалятся задачи (с подзадачами)": "Tasks (including subtasks) to remove", "Удалятся подгруппы": "Subgroups to remove",
  "Удалятся строки текста (заметки, ссылки, картинки)": "Text lines to remove (notes, links, images)",
  "Ссылки ⛔ на удалённые задачи будут убраны из задач": "Tasks whose dependencies on deleted tasks will be removed",
  "Отменить можно только правкой файла.": "Undo is only possible by editing the file.",
  "» будет удалена из файла.": "” will be removed from the file.", "Вместе с ней удалятся подзадачи": "Subtasks to remove",
  "Ссылки ⛔ на неё будут убраны из задач": "Tasks whose dependencies on this task will be removed",
  "ДД.ММ.ГГГГ": "DD.MM.YYYY", "Календарь": "Calendar", "Очистить": "Clear",
  "В начало списка": "Move to top", "Выше": "Move up", "Ниже": "Move down", "В конец списка": "Move to bottom",
  "Уменьшить вложенность": "Outdent", "Увеличить вложенность": "Indent", "Нед. %W": "Week %W", "Сегодня": "Today",
  "Не удалось обновить проект": "Failed to refresh project", "Ошибка записи": "Failed to save",
  "Сюда задачу не перенести": "Cannot move the task here",
  "В файле нет заголовка # — некуда добавить задачу": "Add a # project heading before adding tasks",
  "Нет открытого проекта": "No project open", "Нет открытого проекта.": "No project open.", "Все этапы": "All stages",
  "Свернуть/развернуть уровень": "Collapse/expand level", "Уже дни": "Narrower days", "Шире дни": "Wider days", "+ Задача": "+ Task",
  "Настройки проекта": "Project settings", "(предлагаются галочками в карточке задачи)": "(offered as checkboxes in task details)",
  "не используется": "not used", "Убрать из списка (теги в задачах не трогаются)": "Remove from list (keep task tags)",
  "Список пуст.": "The list is empty.", "В задачах есть ещё": "Also found in tasks", "Добавить найденные": "Add discovered stages",
  "Маркеры": "Markers", "(вертикальные линии на диаграмме; «Сегодня» рисуется всегда)": "(vertical chart lines; Today is always shown)",
  "Подпись": "Label", "CSS-цвет: red, #2f80ed…": "CSS color: red, #2f80ed…", "Выбрать цвет": "Choose color",
  "Удалить маркер": "Delete marker", "Маркеров нет.": "No markers.", "+ Маркер": "+ Marker",
  "Сегодняшняя дата вне диапазона проекта": "Today is outside the project range",
  "Файл изменился — правка отменена, проект перечитан": "The file changed — edit cancelled and project reloaded",
  "Масштаб": "Zoom", "Файл не найден": "File not found", "Не удалось открыть": "Failed to open",
  "Выгружено": "Exported", "Не удалось выгрузить": "Failed to export", "Открыть…": "Open…", "Недавние проекты": "Recent projects",
  "Убрать из списка": "Remove from list", "Открыть другой…": "Open another…", "демо (в памяти)": "demo (in memory)",
  "Экспорт HTML": "Export HTML", "Выгрузить как…": "Export as…", "Сейчас": "Current", "Откройте markdown-файл проекта.": "Open a Markdown project file.",
  "Нет данных": "No data", "выгружено": "exported", "В файле нет данных плана.": "No project data in this file.",
};
const russian: Record<string, string> = {
  "Open current file as Gantt": "Открыть текущий файл в Гантте",
  "Open Gantt beside current note": "Открыть Гантт рядом с заметкой",
  "Open in Project Gantt": "Открыть в Project Gantt", "Open as Markdown": "Открыть Markdown",
  "Open a Markdown project file first": "Сначала откройте Markdown-файл проекта",
  "Failed to open planner": "Не удалось открыть планировщик", "Failed to open project": "Не удалось открыть проект",
  "Failed to restore Markdown view": "Не удалось вернуть Markdown", "File not found": "Файл не найден",
  "Application settings": "Настройки приложения", "Language": "Язык", "System": "Системный",
  "Language changes apply immediately. Project files are not changed.": "Язык меняется сразу. Файлы проектов не изменяются.",
};
export function translator(language: Language): Translate {
  return text => (language === "en" ? english[text] : russian[text]) ?? text;
}
