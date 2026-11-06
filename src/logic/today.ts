import { ACADEMIC_CALENDAR, type SemesterDates } from '../data/calendar';
import type { Day, Semester } from '../data/types';
import type { PlacedMeeting } from './schedule';

/** Дата в формате YYYY-MM-DD по местному времени браузера. */
export function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export type AgendaStatus = 'done' | 'now' | 'next' | 'later';

export interface AgendaItem {
  meeting: PlacedMeeting;
  status: AgendaStatus;
}

export type TodayInfo =
  | { kind: 'no-semester' }
  | { kind: 'shabbat'; semester: Semester }
  | { kind: 'day'; semester: Semester; day: Day; items: AgendaItem[] };

/** Что сегодня: занятия и блокировки текущего дня с отметкой «прошло / идёт / следующее». */
export function todayInfo(
  date: Date,
  meetingsFor: (semester: Semester) => PlacedMeeting[],
  calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR,
): TodayInfo {
  const semester = semesterOn(date, calendar);
  if (!semester) return { kind: 'no-semester' };
  const day = dayOf(date);
  if (day === null) return { kind: 'shabbat', semester };

  const now = date.getHours() * 60 + date.getMinutes();
  const meetings = meetingsFor(semester)
    .filter((m) => m.day === day)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let nextAssigned = false;
  const items = meetings.map((meeting): AgendaItem => {
    if (meeting.end <= now) return { meeting, status: 'done' };
    if (meeting.start <= now) return { meeting, status: 'now' };
    if (!nextAssigned) {
      nextAssigned = true;
      return { meeting, status: 'next' };
    }
    return { meeting, status: 'later' };
  });
  return { kind: 'day', semester, day, items };
}

/** Первое занятие в ближайшие дни после сегодняшнего (до недели вперёд). */
export function nextClassAfterToday(
  date: Date,
  meetingsFor: (semester: Semester) => PlacedMeeting[],
  calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR,
): { date: Date; meeting: PlacedMeeting } | null {
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
    const semester = semesterOn(d, calendar);
    const day = dayOf(d);
    if (!semester || day === null) continue;
    const first = meetingsFor(semester)
      .filter((m) => m.day === day && !m.isBlock)
      .sort((a, b) => a.start - b.start)[0];
    if (first) return { date: d, meeting: first };
  }
  return null;
}
