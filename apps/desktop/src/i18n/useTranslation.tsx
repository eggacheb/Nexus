import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import {
  DICTIONARIES,
  detectInitialLanguage,
  persistLanguage,
  getTranslatedError,
  type SupportedLanguage,
  type I18nDictionary,
} from "./index.js";

export type { SupportedLanguage, I18nDictionary };

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: I18nDictionary;
  translateError: (code: string | undefined | null, fallback?: string) => string;
  formatStatus: (status: string | undefined | null) => string;
  isZh: boolean;
  isJa: boolean;
  isDe: boolean;
  isEn: boolean;
  tText: (zh: string, en: string, ja?: string, de?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(detectInitialLanguage);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    persistLanguage(lang);
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => {
    const t = DICTIONARIES[language] || DICTIONARIES["en-US"];
    const isZh = language.startsWith("zh");
    const isJa = language.startsWith("ja");
    const isDe = language.startsWith("de");
    const isEn = language.startsWith("en");

    const tText = (zh: string, en: string, ja?: string, de?: string): string => {
      if (isZh) return zh;
      if (isJa) return ja || en;
      if (isDe) return de || en;
      return en;
    };

    return {
      language,
      setLanguage,
      t,
      translateError: (code, fallback) => getTranslatedError(code, language, fallback),
      formatStatus: (status) => {
        if (!status) return "";
        const dict = t.statusMap;
        if (!dict) return status;
        const normalized = status.toLowerCase().replace(/[-_]/g, "");
        for (const [k, v] of Object.entries(dict)) {
          if (k.toLowerCase() === normalized) {
            return v;
          }
        }
        return status;
      },
      isZh,
      isJa,
      isDe,
      isEn,
      tText,
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}
