import { Fragment, type ReactNode } from 'react';
import type { SessionType } from '../data/types';
import { LOCALE, type Translator } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import type { MiseryTitle } from '../logic/misery';
import { distanceParts, funComparison } from '../logic/walking';
import { timeRange } from './format';

/**
 * Помощники перевода для сетки, индекса, фактов недели и Wrapped.
 * Английский результат совпадает с прежними строками.
 */

/** Подставить React-узлы вместо {имён}, которые t() оставил как есть (их нет в params). */
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = text.split(/\{(\w+)\}/g);
  return parts.map((part, i) =>
    i % 2 === 0 ? part : <Fragment key={i}>{part in nodes ? nodes[part] : `{${part}}`}</Fragment>,
  );
}

/** Число с ровно `digits` знаками после запятой, в формате языка, без разрядов (как toFixed). */
export function fixed(tr: Translator, n: number, digits: number): string {
  return new Intl.NumberFormat(LOCALE[tr.lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(n);
}

/** Целое — как есть, дробное — с одним знаком (как прежний formatHours). */
export function hoursText(tr: Translator, h: number): string {
  return Number.isInteger(h) ? tr.num(h) : fixed(tr, h, 1);
}

/** В RTL изолировать время и номера, чтобы «10:00–12:00» не перевернулось. */
export function ltr(tr: Translator, s: string): string {
  return tr.dir === 'rtl' ? `⁦${s}⁩` : s;
}

export function span(tr: Translator, start: number, end: number): string {
  return ltr(tr, timeRange(start, end));
}

/** «Lecture 18» — тип занятия на языке интерфейса и номер группы как есть. */
export function group(tr: Translator, type: SessionType, sectionNumber: string): string {
  return `${tr.type(type)} ${sectionNumber}`;
}

export function distance(tr: Translator, meters: number): string {
  const p = distanceParts(meters);
  return tr.t(p.unit === 'm' ? 'fun.m' : 'fun.km', { d: fixed(tr, p.value, p.digits) });
}

/** «about a full marathon» / «примерно целый марафон» / «בערך מרתון שלם». */
export function funText(tr: Translator, meters: number): string {
  const c = funComparison(meters);
  if (c.kind === 'none') return tr.t('fun.none');
  if (c.kind === 'about') return tr.t('fun.about', { what: tr.t(`fun.${c.id}` as MessageKey) });
  // После «%» и «×» — форма `.of` (родительный падеж / с מ־).
  const whatOf = tr.t(`fun.${c.id}.of` as MessageKey);
  if (c.kind === 'percent') return tr.t('fun.percent', { p: c.percent, what: whatOf });
  return tr.t('fun.times', { x: fixed(tr, c.ratio, 1), what: whatOf });
}

/** Титул индекса на языке интерфейса (по id). */
export function titleText(tr: Translator, title: MiseryTitle): { title: string; blurb: string } {
  return {
    title: tr.t(`title.${title.id}` as MessageKey),
    blurb: tr.t(`title.${title.id}.blurb` as MessageKey),
  };
}
