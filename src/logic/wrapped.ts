import { ACADEMIC_CALENDAR, type SemesterDates } from '../data/calendar';
import { DAYS, type Course, type Day, type Semester } from '../data/types';
import { computeMisery, hellDay, pickTitle, type MiseryTitle } from './misery';
import { collectMeetings } from './schedule';
import type { Plan } from './selection';
import { daysBetween, parseDate, weekdayCount, type Phase } from './today';
import { dayWalkMeters } from './walking';

/**
 * BarSuffer Wrapped: недельное расписание × реальное число учебных дней семестра.
 * До семестра это прогноз, во время — «сколько уже позади», после — итоги.
 */
export type WrappedScope = Semester | 'year';

export interface WrappedStats {
  scope: WrappedScope;
  phase: Phase;
  /** Доля пройденного периода, 0…1. */
  fraction: number;
  weeks: number;
  classHours: number;
  sessions: number;
  campusDays: number;
  earlyWakeups: number;
  lateEvenings: number;
  fridays: number;
  gapHours: number;
  walkMeters: number;
  commuteHours: number;
  hellDay: { day: Day; score: number; semester: Semester } | null;
  score: number;
  title: MiseryTitle;
  /** Сколько курсов в периоде. */
  courses: number;
  empty: boolean;
}

export interface WrappedOptions {
  commuteMinutes: number;
  gate?: string;
}

function semestersOf(scope: WrappedScope): Semester[] {
  return scope === 'year' ? ['A', 'B'] : [scope];
}

export function computeWrapped(
  plan: Plan,
  courses: ReadonlyMap<string, Course>,
  scope: WrappedScope,
  options: WrappedOptions,
  today: Date,
  calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR,
): WrappedStats {
  const stats = {
    classHours: 0,
    sessions: 0,
    campusDays: 0,
    earlyWakeups: 0,
    lateEvenings: 0,
    fridays: 0,
    gapHours: 0,
    walkMeters: 0,
  };
  const scores: { semester: Semester; score: number; title: MiseryTitle; meetings: number }[] = [];
  let worst: WrappedStats['hellDay'] = null;
  const courseIds = new Set<string>();
  let weeks = 0;

  const semesters = semestersOf(scope);
  for (const semester of semesters) {
    const dates = calendar.find((s) => s.semester === semester);
    if (!dates) continue;
    const start = parseDate(dates.start);
    const end = parseDate(dates.end);
    weeks += Math.ceil((daysBetween(start, end) + 1) / 7);

    const meetings = collectMeetings(plan, courses, semester);
    for (const m of meetings) courseIds.add(m.courseId);

    for (const day of DAYS) {
      const dayMeetings = meetings.filter((m) => m.day === day);
      if (dayMeetings.length === 0) continue;
      const occ = weekdayCount(start, end, day);
      const misery = computeMisery(dayMeetings);
      stats.campusDays += occ;
      stats.sessions += dayMeetings.length * occ;
      stats.classHours += (dayMeetings.reduce((s, m) => s + (m.end - m.start), 0) / 60) * occ;
      if (misery.earlyClasses > 0) stats.earlyWakeups += occ;
      if (misery.lateClasses > 0) stats.lateEvenings += occ;
      if (day === 6) stats.fridays += occ;
      stats.gapHours += misery.windowHours * occ;
      stats.walkMeters += dayWalkMeters(meetings, day, options.gate) * occ;
    }

    const week = computeMisery(meetings);
    scores.push({ semester, score: week.score, title: pickTitle(week, meetings.length), meetings: meetings.length });
    const hd = hellDay(meetings);
    if (hd && (!worst || hd.score > worst.score)) worst = { ...hd, semester };
  }

  // Период и фаза.
  const first = calendar.find((s) => s.semester === semesters[0]);
  const last = calendar.find((s) => s.semester === semesters[semesters.length - 1]);
  const start = first ? parseDate(first.start) : today;
  const end = last ? parseDate(last.end) : today;
  const length = daysBetween(start, end) + 1;
  const passed = daysBetween(start, today);
  const phase: Phase = passed < 0 ? 'before' : passed >= length ? 'after' : 'during';
  const fraction = phase === 'before' ? 0 : phase === 'after' ? 1 : (passed + 1) / length;

  // Год: средний индекс семестров с занятиями, титул — от более мучительного.
  const active = scores.filter((s) => s.meetings > 0);
  const score = active.length ? Math.round(active.reduce((s, x) => s + x.score, 0) / active.length) : 0;
  const worstSemester = [...active].sort((a, b) => b.score - a.score)[0];
  const title = worstSemester?.title ?? pickTitle(computeMisery([]), 0);

  return {
    scope,
    phase,
    fraction,
    weeks,
    classHours: Math.round(stats.classHours),
    sessions: stats.sessions,
    campusDays: stats.campusDays,
    earlyWakeups: stats.earlyWakeups,
    lateEvenings: stats.lateEvenings,
    fridays: stats.fridays,
    gapHours: stats.gapHours,
    walkMeters: Math.round(stats.walkMeters),
    commuteHours: Math.round((stats.campusDays * 2 * options.commuteMinutes) / 60),
    hellDay: worst,
    score,
    title,
    courses: courseIds.size,
    empty: active.length === 0,
  };
}
