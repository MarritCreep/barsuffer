import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Day, SessionType, Term } from '../data/types';
import { DEFAULT_LANG, dirOf, isLang, render, type Lang, type Params } from './core';
import { MESSAGES, type MessageKey } from './messages';

export const LANG_KEY = 'barsuffer:lang:v1';

/** Локаль для дат и чисел. */
export const LOCALE: Record<Lang, string> = { en: 'en-GB', ru: 'ru-RU', he: 'he-IL' };

export type T = (key: MessageKey, params?: Params) => string;

export interface Translator {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  t: T;
  day: (d: Day | 7, form?: 'short' | 'long') => string;
  type: (s: SessionType) => string;
  term: (s: Term, form?: 'short' | 'long') => string;
  /** Дата YYYY-MM-DD или Date в формате языка. */
  date: (d: string | Date, opts?: Intl.DateTimeFormatOptions) => string;
  num: (n: number, digits?: number) => string;
}

/** Переводчик без React — для canvas, .ics и тестов. */
export function translator(lang: Lang): Translator {
  const dict = MESSAGES[lang];
  const t: T = (key, params) => render(lang, dict[key] ?? MESSAGES.en[key] ?? key, params);
  const locale = LOCALE[lang];
  return {
    lang,
    dir: dirOf(lang),
    t,
    day: (d, form = 'short') => t(`day.${d === 7 ? 'long' : form}.${d}` as MessageKey),
    type: (s) => t(`type.${s}` as MessageKey),
    term: (s, form = 'short') => t((form === 'long' ? `term.long.${s}` : `term.${s}`) as MessageKey),
    date: (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
      const value = typeof d === 'string' ? new Date(`${d}T12:00:00`) : d;
      return new Intl.DateTimeFormat(locale, opts).format(value);
    },
    num: (n, digits) =>
      new Intl.NumberFormat(locale, digits === undefined ? undefined : { maximumFractionDigits: digits }).format(n),
  };
}

export function loadLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return isLang(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* приватный режим — язык просто не запомнится */
  }
}

interface Ctx extends Translator {
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? loadLang());

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    saveLang(next);
  }, []);

  const value = useMemo<Ctx>(() => ({ ...translator(lang), setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
