import type { Semester } from './types';

/**
 * Учебный календарь תשפ"ז (2026–2027): даты занятий по семестрам.
 * Источник: официальный לוח שנה תשפ"ז, biu.ac.il (inline-files/luzshulchani27-26.pdf).
 * Праздники и дни без занятий внутри семестра пока не учитываются.
 */
export interface SemesterDates {
  semester: Semester;
  /** Первый и последний день занятий, YYYY-MM-DD включительно. */
  start: string;
  end: string;
}

export const ACADEMIC_CALENDAR: SemesterDates[] = [
  { semester: 'A', start: '2026-10-11', end: '2027-01-17' },
  { semester: 'B', start: '2027-03-01', end: '2027-06-25' },
];
