import type { v } from "@/lib/valibot";
import { MultiLocaleTextSchema } from "@simularity/api/lib/schema";

export const SUPPORTED_LOCALES: Record<
  string,
  {
    label: string;
  }
> = {
  "en-US": {
    label: "English",
  },
  "ru-RU": {
    label: "Русский",
  },
};

export const SUPPORTED_LOCALE_SELECT_VALUES = Object.entries(
  SUPPORTED_LOCALES,
).map(([id, lang]) => ({
  value: id,
  label: lang.label,
}));

export function localesToSelectValues(
  locales: Intl.Locale[],
): { value: string; label: string }[] {
  return locales.map((locale) => ({
    value: locale.toString(),
    label: SUPPORTED_LOCALES[locale.toString()]?.label ?? locale.toString(),
  }));
}

const DEFAULT_LOCALE_STRING: keyof typeof SUPPORTED_LOCALES = "en-US";
export const DEFAULT_LOCALE = new Intl.Locale(DEFAULT_LOCALE_STRING);

/**
 * Get the translation for the target locale, falling back to the fallback locale.
 */
export function translationWithFallback(
  source: v.InferOutput<typeof MultiLocaleTextSchema>,
  targetLocale: Intl.Locale,
): string {
  const localeString = targetLocale.toString();

  if (localeString in source) {
    return source[localeString as keyof typeof source]!;
  } else if (DEFAULT_LOCALE_STRING in source) {
    return source[DEFAULT_LOCALE_STRING as keyof typeof source]!;
  } else {
    // Fallback to the first available translation.
    return source[Object.keys(source)[0] as keyof typeof source]!;
  }
}

/**
 * If the locale is not supported, return the default locale.
 */
export function filterLocale(locale: Intl.Locale): Intl.Locale {
  if (SUPPORTED_LOCALES[locale.toString()]) {
    return locale;
  }

  return DEFAULT_LOCALE;
}
