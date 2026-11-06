/**
 * Ядро перевода без React: языки, формы множественного числа, подстановка {параметров}.
 * Названия курсов не переводятся — они приходят из каталога как есть.
 */

export type Lang = 'en' | 'ru' | 'he';

export const LANGS: { id: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'ru', label: 'Русский', dir: 'ltr' },
  { id: 'he', label: 'עברית', dir: 'rtl' },
];

export const DEFAULT_LANG: Lang = 'en';

/** Формы множественного числа по Intl.PluralRules. `other` — обязательна. */
export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type Msg = string | Plural;

/** Словарь другого языка повторяет ключи английского: строка → строка, формы → формы. */
export type Dict<T> = { [K in keyof T]: T[K] extends string ? string : Plural };

export type Params = Record<string, string | number>;

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'ru' || v === 'he';
}

export function dirOf(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'he' ? 'rtl' : 'ltr';
}

const rulesCache = new Map<Lang, Intl.PluralRules>();
function rules(lang: Lang): Intl.PluralRules {
  let r = rulesCache.get(lang);
  if (!r) {
    r = new Intl.PluralRules(lang);
    rulesCache.set(lang, r);
  }
  return r;
}

/** Выбрать форму: для чисел — по правилам языка; параметр счёта — `n`. */
export function pickForm(lang: Lang, msg: Msg, n: number | undefined): string {
  if (typeof msg === 'string') return msg;
  if (n === undefined) return msg.other;
  const cat = rules(lang).select(n) as keyof Plural;
  return msg[cat] ?? msg.other;
}

export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in params ? String(params[name]) : all,
  );
}

export function render(lang: Lang, msg: Msg, params?: Params): string {
  const n = typeof params?.n === 'number' ? params.n : undefined;
  return interpolate(pickForm(lang, msg, n), params);
}
