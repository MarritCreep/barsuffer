import { daysBetween, parseDate } from './today';

/**
 * Экзамены — вводит сам студент (официальных дат в нашем образце нет).
 * Считаем промежутки между экзаменами одного мועד и шуточный «индекс страдания сессии».
 */

export type Moed = 'A' | 'B' | 'C';

export interface ExamEntry {
  id: string;
  /** Курс из плана или свободное название. */
  courseId?: string;
  label: string;
  moed: Moed;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, если известно. */
  time?: string;
}

export interface ExamGap {
  from: ExamEntry;
  to: ExamEntry;
  /** Полных дней на подготовку между экзаменами (без дня самих экзаменов). */
  studyDays: number;
}

export interface ExamSeason {
  moed: Moed;
  exams: ExamEntry[];
  gaps: ExamGap[];
  /** Экзамены в один день. */
  sameDay: [ExamEntry, ExamEntry][];
  score: number;
  /** Самый короткий промежуток или null, если экзамен один. */
  tightest: ExamGap | null;
}

/** Штраф за промежуток: 0 дней — 30, 1 — 20, 2 — 12, 3 — 6, 4 — 2, дальше 0. */
export function gapPenalty(studyDays: number): number {
  return [30, 20, 12, 6, 2][Math.max(0, studyDays)] ?? 0;
}

export function sortExams(exams: readonly ExamEntry[]): ExamEntry[] {
  return [...exams].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

export function examSeason(exams: readonly ExamEntry[], moed: Moed): ExamSeason {
  const list = sortExams(exams.filter((e) => e.moed === moed));
  const gaps: ExamGap[] = [];
  const sameDay: [ExamEntry, ExamEntry][] = [];
  for (let i = 1; i < list.length; i++) {
    const from = list[i - 1]!;
    const to = list[i]!;
    const diff = daysBetween(parseDate(from.date), parseDate(to.date));
    if (diff === 0) sameDay.push([from, to]);
    gaps.push({ from, to, studyDays: Math.max(0, diff - 1) });
  }
  // Один и тот же день — отдельный штраф сверху.
  const raw = gaps.reduce((s, g) => s + gapPenalty(g.studyDays), 0) + sameDay.length * 25 + list.length * 4;
  const tightest = gaps.length ? gaps.reduce((a, b) => (b.studyDays < a.studyDays ? b : a)) : null;
  return { moed, exams: list, gaps, sameDay, score: Math.min(100, raw), tightest };
}

/** Сколько дней до экзамена от сегодняшней даты (отрицательно — уже прошёл). */
export function daysUntil(exam: ExamEntry, today: string): number {
  return daysBetween(parseDate(today), parseDate(exam.date));
}

export function nextExam(exams: readonly ExamEntry[], today: string): ExamEntry | null {
  return sortExams(exams).find((e) => e.date >= today) ?? null;
}

export function isExamEntry(v: unknown): v is ExamEntry {
  const e = v as Partial<ExamEntry> | null;
  return (
    !!e &&
    typeof e.id === 'string' &&
    typeof e.label === 'string' &&
    (e.moed === 'A' || e.moed === 'B' || e.moed === 'C') &&
    typeof e.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    (e.time === undefined || (typeof e.time === 'string' && /^\d{2}:\d{2}$/.test(e.time)))
  );
}
