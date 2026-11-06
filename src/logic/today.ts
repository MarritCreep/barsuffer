import { ACADEMIC_CALENDAR, NO_CLASS_PERIODS, type NoClassPeriod, type SemesterDates } from '../data/calendar';
import { holidayEffect, periodOn } from './holidays';
import type { Day, Semester } from '../data/types';
import type { PlacedMeeting } from './schedule';

/** Дата в формате YYYY-MM-DD по местному времени браузера. */
export function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" → локальная полночь. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

const DAY_MS = 86_400_000;

export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

/** Сколько раз день недели встречается в промежутке дат (включительно). */
export function weekdayCount(start: Date, end: Date, day: Day): number {
  const total = daysBetween(start, end);
  if (total < 0) return 0;
  const offset = (day - 1 - start.getDay() + 7) % 7; // day 1 = воскресенье = getDay() 0
  if (offset > total) return 0;
  return Math.floor((total - offset) / 7) + 1;
}

export type Phase = 'before' | 'during' | 'after';

export interface SemesterProgress {
  semester: Semester;
  phase: Phase;
  start: Date;
  end: Date;
  /** Номер текущей недели (1…), во время семестра. */
  week: number;
  totalWeeks: number;
  /** Доля прошедших дней, 0…1. */
  fraction: number;
  daysLeft: number;
  daysUntilStart: number;
}

export function semesterProgress(
  date: Date,
  semester: Semester,
  calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR,
): SemesterProgress | null {
  const dates = calendar.find((s) => s.semester === semester);
  if (!dates) return null;
  const start = parseDate(dates.start);
  const end = parseDate(dates.end);
  const length = daysBetween(start, end) + 1;
  const passed = daysBetween(start, date);
  const phase: Phase = passed < 0 ? 'before' : passed >= length ? 'after' : 'during';
  return {
    semester,
    phase,
    start,
    end,
    week: phase === 'during' ? Math.floor(passed / 7) + 1 : 0,
    totalWeeks: Math.ceil(length / 7),
    fraction: Math.min(1, Math.max(0, phase === 'during' ? (passed + 1) / length : phase === 'after' ? 1 : 0)),
    daysLeft: Math.max(0, daysBetween(date, end)),
    daysUntilStart: Math.max(0, -passed),
  };
}

/** Сколько занятий ещё впереди в семестре (после текущего момента), без отменённых праздниками. */
export function remainingSessions(
  date: Date,
  semester: Semester,
  meetings: readonly PlacedMeeting[],
  calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR,
  periods: readonly NoClassPeriod[] = NO_CLASS_PERIODS,
): number {
  const dates = calendar.find((s) => s.semester === semester);
  if (!dates) return 0;
  const end = parseDate(dates.end);
  const start = parseDate(dates.start);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowMin = date.getHours() * 60 + date.getMinutes();
  const classes = meetings.filter((m) => !m.isBlock);
  let count = 0;
  for (let d = today > start ? today : start; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const day = dayOf(d);
    if (day === null) continue;
    const iso = localDate(d);
    const period = periodOn(iso, periods);
    const isToday = d.getTime() === today.getTime();
    for (const m of classes) {
      if (m.day !== day || holidayEffect(m, period) === 'cancelled') continue;
      if (isToday && m.start <= nowMin) continue;
      count++;
    }
  }
  return count;
}
export function semesterOn(date: Date, calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR): Semester | null {
  const today = localDate(date);
  return calendar.find((s) => s.start <= today && today <= s.end)?.semester ?? null;
}

/** День недели в нашей нумерации (1 = воскресенье … 6 = пятница); суббота — null. */
export function dayOf(date: Date): Day | null {
  const js = date.getDay(); // 0 = воскресенье
  return js === 6 ? null : ((js + 1) as Day);
}

export type AgendaStatus = 'done' | 'now' | 'next' | 'later' | 'cancelled';

export interface AgendaItem {
  meeting: PlacedMeeting;
  status: AgendaStatus;
  /** Встреча короче из-за праздника (занятия до определённого часа). */
  shortened?: boolean;
}

export type TodayInfo =
  | { kind: 'no-semester' }
  | { kind: 'shabbat'; semester: Semester }
  | { kind: 'holiday'; semester: Semester; holiday: NoClassPeriod }
  | { kind: 'day'; semester: Semester; day: Day; items: AgendaItem[]; holiday?: NoClassPeriod };

/** Что сегодня: занятия и блокировки текущего дня с отметкой «прошло / идёт / следующее». */
export function todayInfo(
  date: Date,
  meetingsFor: (semester: Semester) => PlacedMeeting[],
  calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR,
  periods: readonly NoClassPeriod[] = NO_CLASS_PERIODS,
): TodayInfo {
  const semester = semesterOn(date, calendar);
  if (!semester) return { kind: 'no-semester' };
  const day = dayOf(date);
  if (day === null) return { kind: 'shabbat', semester };
  const holiday = periodOn(localDate(date), periods);
  if (holiday?.off) return { kind: 'holiday', semester, holiday };

  const now = date.getHours() * 60 + date.getMinutes();
  const meetings = meetingsFor(semester)
    .filter((m) => m.day === day)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let nextAssigned = false;
  const items = meetings.map((meeting): AgendaItem => {
    const effect = meeting.isBlock ? null : holidayEffect(meeting, holiday);
    if (effect === 'cancelled') return { meeting, status: 'cancelled' };
    const short = effect === 'shortened' ? { shortened: true } : {};
    if (meeting.end <= now) return { meeting, status: 'done', ...short };
    if (meeting.start <= now) return { meeting, status: 'now', ...short };
    if (!nextAssigned) {
      nextAssigned = true;
      return { meeting, status: 'next', ...short };
    }
    return { meeting, status: 'later', ...short };
  });
  return { kind: 'day', semester, day, items, ...(holiday ? { holiday } : {}) };
}

/** Первое занятие в ближайшие дни после сегодняшнего (до трёх недель вперёд — праздники бывают длинными). */
export function nextClassAfterToday(
  date: Date,
  meetingsFor: (semester: Semester) => PlacedMeeting[],
  calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR,
  periods: readonly NoClassPeriod[] = NO_CLASS_PERIODS,
): { date: Date; meeting: PlacedMeeting } | null {
  for (let offset = 1; offset <= 21; offset++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
    const semester = semesterOn(d, calendar);
    const day = dayOf(d);
    if (!semester || day === null) continue;
    const first = meetingsFor(semester)
      .filter((m) => m.day === day && !m.isBlock && holidayEffect(m, periodOn(localDate(d), periods)) !== 'cancelled')
      .sort((a, b) => a.start - b.start)[0];
    if (first) return { date: d, meeting: first };
  }
  return null;
}
