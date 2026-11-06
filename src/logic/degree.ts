/**
 * Прогресс степени (BA) по общеуниверситетским требованиям Бар-Илана. Всё вводит студент.
 * Источники (проверено 2026-11-06):
 * - 128 נ"ז — «стандартный» BA (пример: требования кафедры еврейской истории на תשפ"ז);
 *   английский и הבעה עברית в эти 128 не входят. У факультетов бывает по-другому.
 * - Оламот (бывш. «Основы иудаики»): 20 נ"ז, уменьшенные нормы для программ, освобождения —
 *   olamot.biu.ac.il/en/node/2604, olamot.biu.ac.il/exempba.
 * - Английский: уровни по психометрии, פטור от 134, закончить до конца 2-го года,
 *   курсы на английском (EMI) — efl.biu.ac.il.
 * - הבעה עברית: обязательна или освобождение — hebrew.biu.ac.il (תקנון תשפ"ו).
 */

export const DEFAULT_TOTAL = 128;

export type Bucket = 'major' | 'olamot' | 'general';
export type CourseStatus = 'done' | 'now';

export interface DegreeCourse {
  id: string;
  name: string;
  credits: number;
  bucket: Bucket;
  status: CourseStatus;
  /** Курс читается на английском (EMI) — засчитывается в требование по английскому. */
  emi?: boolean;
}

/** Нормы Оламот: стандарт и уменьшенные по программам; null — своё число. */
export const OLAMOT_TRACKS = {
  standard: 20,
  law: 4,
  bible: 16,
  talmud: 12,
  jewishHistory: 12,
  secondDouble: 10,
  secondSingle: 14,
  /** Второй BA после BA в Бар-Илане, или полное освобождение (ешива/мидраша, через Инбар на 1-м году). */
  exempt: 0,
  /** Студенты-неевреи: Оламот нет, вместо них 20 נ"ז общих курсов. */
  nonJewish: 0,
  custom: null,
} as const satisfies Record<string, number | null>;

export type OlamotTrack = keyof typeof OLAMOT_TRACKS;

export const NON_JEWISH_GENERAL = 20;
/** Сколько Оламот можно набрать к концу года (накопительно): 1-й год — до 16, 2-й — до 20. */
export const OLAMOT_YEAR_CAP: Record<number, number> = { 1: 16, 2: 20 };

export type EnglishLevel = 'preBasicB' | 'basic' | 'advA' | 'advB' | 'exempt';
export const ENGLISH_CHAIN: Exclude<EnglishLevel, 'exempt'>[] = ['preBasicB', 'basic', 'advA', 'advB'];

/** Уровень по баллу английского в психометрии / Амиранет. */
export function englishLevelForScore(score: number): EnglishLevel | null {
  if (score >= 134) return 'exempt';
  if (score >= 120) return 'advB';
  if (score >= 100) return 'advA';
  if (score >= 85) return 'basic';
  if (score >= 70) return 'preBasicB';
  return null;
}

/** Курсы английского, которые нужно пройти от начального уровня. */
export function englishSteps(level: EnglishLevel): Exclude<EnglishLevel, 'exempt'>[] {
  if (level === 'exempt') return [];
  return ENGLISH_CHAIN.slice(ENGLISH_CHAIN.indexOf(level));
}

/** Курсов на английском (EMI): до 119 — 0, 120–133 — 1, от 134 — 2 (для начавших с 2021–22). */
export function emiRequired(level: EnglishLevel): number {
  return level === 'exempt' ? 2 : level === 'advB' ? 1 : 0;
}

export type HebrewStatus = 'required' | 'exempt' | 'done';

export interface DegreeState {
  v: 1;
  total: number;
  /** Кредиты кафедры (если известны). */
  majorTarget: number | null;
  year: 1 | 2 | 3 | 4;
  olamotTrack: OlamotTrack;
  olamotCustom: number;
  englishLevel: EnglishLevel;
  englishDone: Exclude<EnglishLevel, 'exempt'>[];
  hebrew: HebrewStatus;
  courses: DegreeCourse[];
}

export const DEFAULT_DEGREE: DegreeState = {
  v: 1,
  total: DEFAULT_TOTAL,
  majorTarget: null,
  year: 1,
  olamotTrack: 'standard',
  olamotCustom: 20,
  englishLevel: 'advA',
  englishDone: [],
  hebrew: 'required',
  courses: [],
};

export interface BucketProgress {
  done: number;
  now: number;
  target: number;
}

export type DegreeWarning =
  | 'olamotYearCap'
  | 'englishDeadline'
  | 'englishOnly'
  | 'hebrewYear1'
  | 'overTotal';

export interface DegreeProgress {
  total: BucketProgress;
  major: BucketProgress | null;
  olamot: BucketProgress;
  general: BucketProgress | null;
  english: {
    steps: { level: Exclude<EnglishLevel, 'exempt'>; done: boolean }[];
    emi: { done: number; now: number; target: number };
    complete: boolean;
  };
  hebrewDone: boolean;
  warnings: DegreeWarning[];
  /** Всё закрыто (по тому, что ввёл студент). */
  complete: boolean;
}

export function olamotTarget(state: DegreeState): number {
  const v = OLAMOT_TRACKS[state.olamotTrack];
  return v === null ? Math.max(0, state.olamotCustom) : v;
}

function sum(courses: readonly DegreeCourse[], pred: (c: DegreeCourse) => boolean): BucketProgress['done'] {
  return courses.filter(pred).reduce((s, c) => s + c.credits, 0);
}

export function degreeProgress(state: DegreeState): DegreeProgress {
  const { courses } = state;
  const bucket = (b: Bucket, target: number): BucketProgress => ({
    done: sum(courses, (c) => c.bucket === b && c.status === 'done'),
    now: sum(courses, (c) => c.bucket === b && c.status === 'now'),
    target,
  });

  const olamot = bucket('olamot', olamotTarget(state));
  const general =
    state.olamotTrack === 'nonJewish' ? bucket('general', NON_JEWISH_GENERAL) : null;
  const major = state.majorTarget !== null ? bucket('major', state.majorTarget) : null;
  const total: BucketProgress = {
    done: sum(courses, (c) => c.status === 'done'),
    now: sum(courses, (c) => c.status === 'now'),
    target: state.total,
  };

  const steps = englishSteps(state.englishLevel).map((level) => ({ level, done: state.englishDone.includes(level) }));
  const emiTarget = emiRequired(state.englishLevel);
  const emi = {
    done: courses.filter((c) => c.emi && c.status === 'done').length,
    now: courses.filter((c) => c.emi && c.status === 'now').length,
    target: emiTarget,
  };
  const englishComplete = steps.every((s) => s.done) && emi.done >= emiTarget;
  const coursesComplete = steps.every((s) => s.done);
  const hebrewDone = state.hebrew !== 'required';

  const warnings: DegreeWarning[] = [];
  const cap = OLAMOT_YEAR_CAP[state.year];
  if (cap !== undefined && olamot.done + olamot.now > cap && olamot.target > 0) warnings.push('olamotYearCap');
  if (!coursesComplete && state.year === 2) warnings.push('englishDeadline');
  if (!coursesComplete && state.year >= 3) warnings.push('englishOnly');
  if (!hebrewDone && state.year >= 2) warnings.push('hebrewYear1');
  if (total.done + total.now > total.target + 8) warnings.push('overTotal');

  const reached = (b: BucketProgress | null) => b === null || b.done >= b.target;
  return {
    total,
    major,
    olamot,
    general,
    english: { steps, emi, complete: englishComplete },
    hebrewDone,
    warnings,
    complete: reached(total) && reached(major) && reached(olamot) && reached(general) && englishComplete && hebrewDone,
  };
}

const LEVELS: EnglishLevel[] = ['preBasicB', 'basic', 'advA', 'advB', 'exempt'];

export function sanitizeDegree(value: unknown): DegreeState {
  const v = value as Partial<DegreeState> | null;
  if (!v || v.v !== 1) return DEFAULT_DEGREE;
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : d);
  const courses = Array.isArray(v.courses)
    ? v.courses.filter(
        (c): c is DegreeCourse =>
          typeof c?.id === 'string' &&
          typeof c.name === 'string' &&
          typeof c.credits === 'number' &&
          (c.bucket === 'major' || c.bucket === 'olamot' || c.bucket === 'general') &&
          (c.status === 'done' || c.status === 'now'),
      )
    : [];
  const englishLevel = LEVELS.includes(v.englishLevel as EnglishLevel) ? (v.englishLevel as EnglishLevel) : DEFAULT_DEGREE.englishLevel;
  return {
    v: 1,
    total: num(v.total, DEFAULT_TOTAL),
    majorTarget: v.majorTarget === null || v.majorTarget === undefined ? null : num(v.majorTarget, 0),
    year: v.year === 2 || v.year === 3 || v.year === 4 ? v.year : 1,
    olamotTrack: v.olamotTrack && v.olamotTrack in OLAMOT_TRACKS ? v.olamotTrack : 'standard',
    olamotCustom: num(v.olamotCustom, 20),
    englishLevel,
    englishDone: Array.isArray(v.englishDone) ? v.englishDone.filter((l) => ENGLISH_CHAIN.includes(l)) : [],
    hebrew: v.hebrew === 'exempt' || v.hebrew === 'done' ? v.hebrew : 'required',
    courses,
  };
}
