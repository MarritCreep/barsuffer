import { ACADEMIC_CALENDAR, NO_CLASS_PERIODS, type NoClassPeriod, type SemesterDates } from '../data/calendar';
import type { Semester } from '../data/types';
import type { PlacedMeeting } from './schedule';
import { holidayEffect, periodOn } from './holidays';
import { dayOf, localDate, parseDate } from './today';

/** Конкретная встреча в конкретный день семестра. */
export interface Occurrence {
  /** Стабильный ключ: курс|группа|дата|начало — для отметок посещаемости. */
  key: string;
  date: string;
  meeting: PlacedMeeting;
  /** Праздник, из-за которого встречи нет. */
  cancelledBy?: string;
  /** Праздник, из-за которого встреча короче (занятия до определённого часа). */
  shortenedBy?: string;
}

export function occurrenceKey(m: Pick<PlacedMeeting, 'courseId' | 'sectionNumber' | 'start'>, date: string): string {
  return `${m.courseId}|${m.sectionNumber}|${date}|${m.start}`;
}

export { holidayEffect, periodOn };

/** Все дни семестра (YYYY-MM-DD), по порядку. */
export function semesterDays(semester: Semester, calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR): string[] {
  const dates = calendar.find((s) => s.semester === semester);
  if (!dates) return [];
  const result: string[] = [];
  const end = parseDate(dates.end);
  for (let d = parseDate(dates.start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    result.push(localDate(d));
  }
  return result;
}

/**
 * Все встречи семестра по датам: недельное расписание × календарь, с учётом праздников.
 * Отменённые встречи тоже возвращаются (с `cancelledBy`), чтобы их можно было показать.
 */
export function occurrences(
  meetings: readonly PlacedMeeting[],
  semester: Semester,
  calendar: readonly SemesterDates[] = ACADEMIC_CALENDAR,
  periods: readonly NoClassPeriod[] = NO_CLASS_PERIODS,
): Occurrence[] {
  const result: Occurrence[] = [];
  for (const date of semesterDays(semester, calendar)) {
    const day = dayOf(parseDate(date));
    if (day === null) continue;
    const period = periodOn(date, periods);
    for (const m of meetings) {
      if (m.day !== day) continue;
      const effect = holidayEffect(m, period);
      result.push({
        key: occurrenceKey(m, date),
        date,
        meeting: m,
        ...(effect === 'cancelled' && period ? { cancelledBy: period.id } : {}),
        ...(effect === 'shortened' && period ? { shortenedBy: period.id } : {}),
      });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.meeting.start - b.meeting.start);
}

/** Только встречи, которые действительно состоятся. */
export function heldOccurrences(...args: Parameters<typeof occurrences>): Occurrence[] {
  return occurrences(...args).filter((o) => !o.cancelledBy);
}
