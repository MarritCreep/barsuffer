import type { Course } from '../data/types';
import type { Plan } from './selection';
import type { TimeSpan } from './schedule';

/**
 * Академические часы в неделю: одна клетка сетки (час) — один академический час,
 * пара 10:00–12:00 — два часа. Накладки не схлопываются: это нагрузка, а не время в кампусе.
 */
export function academicHours(meetings: readonly TimeSpan[]): number {
  const minutes = meetings.reduce((sum, m) => sum + (m.end - m.start), 0);
  return Math.round((minutes / 60) * 10) / 10;
}

export interface CreditsSummary {
  /** Сумма נ"ז по курсам с известными кредитами. Годовой курс считается один раз. */
  total: number;
  /** Сколько курсов без данных о кредитах. */
  unknown: number;
}

export function totalCredits(plan: Plan, courses: ReadonlyMap<string, Course>): CreditsSummary {
  let total = 0;
  let unknown = 0;
  for (const planned of plan.courses) {
    const course = courses.get(planned.courseId);
    if (!course || planned.hidden) continue;
    if (course.credits === null) unknown++;
    else total += course.credits;
  }
  return { total, unknown };
}
