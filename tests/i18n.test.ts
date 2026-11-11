import { describe, expect, it } from "vitest";
import { languagePreference, resolveLanguage, translator } from "../src/core/i18n";

describe("language resolution", () => {
  it("uses explicit preferences and falls back to English for unsupported system languages", () => {
    expect(resolveLanguage("system", "ru-RU")).toBe("ru");
    expect(resolveLanguage("system", "de-DE")).toBe("en");
    expect(resolveLanguage("en", "ru")).toBe("en");
    expect(resolveLanguage("ru", "en")).toBe("ru");
    expect(languagePreference("invalid")).toBe("system");
    expect(languagePreference(null)).toBe("system");
  });
  it("keeps translations isolated and leaves user text untouched", () => {
    const en = translator("en"), ru = translator("ru");
    expect(en("Задача")).toBe("Task");
    expect(ru("Задача")).toBe("Задача");
    expect(ru("Open current file as Gantt")).toBe("Открыть текущий файл в Гантте");
    expect(en("Custom project name")).toBe("Custom project name");
    expect(en("Задача")).toBe("Task");
  });
});
