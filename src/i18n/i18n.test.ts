import { describe, expect, it } from 'vitest';
import { pickForm, render, type Msg } from './core';
import { translator } from './I18n';
import { MESSAGES } from './messages';

const placeholders = (msg: Msg) => {
  const texts = typeof msg === 'string' ? [msg] : Object.values(msg).filter((v): v is string => typeof v === 'string');
  return [...new Set(texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
};

describe('i18n', () => {
  it('chooses plural forms by language', () => {
    const ru: Msg = { one: '{n} курс', few: '{n} курса', many: '{n} курсов', other: '{n} курса' };
    expect(render('ru', ru, { n: 1 })).toBe('1 курс');
    expect(render('ru', ru, { n: 3 })).toBe('3 курса');
    expect(render('ru', ru, { n: 11 })).toBe('11 курсов');
    expect(render('ru', ru, { n: 21 })).toBe('21 курс');
    expect(pickForm('he', { one: 'אחד', two: 'שניים', other: 'הרבה' }, 2)).toBe('שניים');
    expect(render('en', { one: '{n} day', other: '{n} days' }, { n: 2 })).toBe('2 days');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(render('en', 'a {x} b {y}', { x: 1 })).toBe('a 1 b {y}');
  });

  it('has a non-empty translation for every key, with the same placeholders', () => {
    for (const lang of ['ru', 'he'] as const) {
      for (const [key, en] of Object.entries(MESSAGES.en)) {
        const msg = MESSAGES[lang][key as keyof typeof MESSAGES.en];
        expect(msg, `${lang} ${key}`).toBeDefined();
        const texts = typeof msg === 'string' ? [msg] : Object.values(msg);
        for (const t of texts) expect(String(t).trim(), `${lang} ${key}`).not.toBe('');
        // Плюральные формы могут опускать {n} («שעתיים»), остальные параметры — обязательны.
        const want = placeholders(en).filter((p) => p !== 'n');
        const got = placeholders(msg).filter((p) => p !== 'n');
        expect(got, `${lang} ${key}`).toEqual(want);
      }
    }
  });

  it('translates days and types', () => {
    const he = translator('he');
    expect(he.dir).toBe('rtl');
    expect(he.day(1, 'long')).toBe('יום ראשון');
    expect(translator('ru').type('lecture')).toBe('Лекция');
    expect(translator('en').term('year')).toBe('Yearly');
  });
});
