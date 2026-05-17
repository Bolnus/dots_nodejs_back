import type { Locale } from "./i18nTypes.js";
import { en } from "./en.js";
import { ru } from "./ru.js";

type Dictionary = Record<keyof typeof en, string>;

/** Resolves an incoming language code to one of the supported locales. */
export function toLocale(languageCode: string | undefined): Locale {
  const raw = languageCode?.trim().toLowerCase();
  if (raw === undefined || raw === "") {
    return "en";
  }
  if (raw === "ru" || raw.startsWith("ru-")) {
    return "ru";
  }
  return "en";
}

const dictionaries: Record<Locale, Dictionary> = { en, ru };

/** Replaces a single `{var}` placeholder if a value is present. */
function replaceInterpolation(match: string, name: string, vars: Record<string, string>): string {
  const v = vars[name];
  return v === undefined ? match : v;
}

/** Interpolates `{var}` placeholders using the provided map. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replaceAll(/\{(\w+)\}/g, (match: string, name: string) => replaceInterpolation(match, name, vars));
}

/** Formats a localized message string and optionally interpolates variables. */
export function formatMessage(
  languageCode: string | undefined,
  key: keyof Dictionary,
  vars?: Record<string, string>
): string {
  const locale = toLocale(languageCode);
  const dict = dictionaries[locale];
  const template = dict[key];
  if (vars === undefined) {
    return template;
  }
  return interpolate(template, vars);
}
