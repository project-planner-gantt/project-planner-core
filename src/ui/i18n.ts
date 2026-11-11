import { getContext } from "svelte";
import { en, ru } from "@svar-ui/core-locales";
import { translator, type Language } from "../core/i18n";
export const I18N_KEY = "project-gantt-i18n";
export function createI18n(language: Language) {
  return { language, t: translator(language), words: language === "ru" ? ru : en };
}
export function getI18n() {
  return getContext<ReturnType<typeof createI18n>>(I18N_KEY) ?? createI18n("ru");
}
