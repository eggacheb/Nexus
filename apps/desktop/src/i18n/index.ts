import { enUS } from "./locales/en-US.js";
import { zhCN } from "./locales/zh-CN.js";
import { jaJP } from "./locales/ja-JP.js";
import { deDE } from "./locales/de-DE.js";
import type { I18nDictionary, SupportedLanguage } from "./types.js";

export * from "./types.js";
export { enUS } from "./locales/en-US.js";
export { zhCN } from "./locales/zh-CN.js";
export { jaJP } from "./locales/ja-JP.js";
export { deDE } from "./locales/de-DE.js";

export const DICTIONARIES: Record<SupportedLanguage, I18nDictionary> = {
  "zh-CN": zhCN,
  "en-US": enUS,
  "ja-JP": jaJP,
  "de-DE": deDE,
};

const STORAGE_KEY = "localbridge_language";

export function detectInitialLanguage(): SupportedLanguage {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
      if (saved && (saved === "zh-CN" || saved === "en-US" || saved === "ja-JP" || saved === "de-DE")) {
        return saved;
      }
    }
  } catch {
    // Fallback if localStorage is inaccessible
  }
  return "en-US";
}

export function persistLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore storage write failures
  }
}

export function getTranslatedError(
  code: string | undefined | null,
  lang: SupportedLanguage,
  fallbackMessage?: string
): string {
  if (!code) return fallbackMessage || DICTIONARIES[lang].errors.unknown;
  const dict = DICTIONARIES[lang];
  const translated = (dict.errors as Record<string, string>)[code];
  if (translated) {
    return translated;
  }
  return fallbackMessage ? `${fallbackMessage} (${code})` : `${dict.errors.unknown} (${code})`;
}

export function formatBackendStatus(
  status: string | undefined | null,
  lang: SupportedLanguage
): string {
  if (!status) return "";
  const dict = DICTIONARIES[lang]?.statusMap;
  if (!dict) return status;
  const normalized = status.toLowerCase().replace(/[-_]/g, "");
  for (const [k, v] of Object.entries(dict)) {
    if (k.toLowerCase() === normalized) {
      return v;
    }
  }
  return status;
}
