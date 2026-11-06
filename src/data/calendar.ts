import type { Semester } from './types';

/**
 * Учебный календарь תשפ"ז (2026–2027).
 * Источник: официальный לוח שנה תשפ"ז, biu.ac.il/sites/default/files/inline-files/luzshulchani27-26.pdf
 * (зелёный цвет в календаре = «חופשות – אין לימודים»). Проверено 2026-11-06.
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

/** Сессии (в календаре нет деления на מועד א/ב — даты экзаменов в Tomex/Инбаре). */
export const EXAM_PERIODS: { semester: Semester; start: string; end: string }[] = [
  { semester: 'A', start: '2027-01-18', end: '2027-02-28' },
  { semester: 'B', start: '2027-06-27', end: '2027-08-31' },
];

/**
 * Праздник или особый день; id — ключ перевода `holiday.<id>`.
 * off — занятий нет; until — занятия только до этого часа; pause — перерыв (церемония).
 */
export interface NoClassPeriod {
  id: string;
  /** YYYY-MM-DD включительно. */
  from: string;
  to: string;
  off?: boolean;
  until?: string;
  pause?: [string, string];
}

export const NO_CLASS_PERIODS: NoClassPeriod[] = [
  // Семестр A
  { id: 'rabin', from: '2026-10-22', to: '2026-10-22', pause: ['11:00', '12:00'] },
  { id: 'hanukkah', from: '2026-12-04', to: '2026-12-07', off: true },
  { id: 'hanukkahCandles', from: '2026-12-08', to: '2026-12-10', until: '16:00' },
  { id: 'tevet', from: '2026-12-20', to: '2026-12-20', off: true },
  // Семестр B
  { id: 'purim', from: '2027-03-22', to: '2027-03-24', off: true },
  { id: 'pesach', from: '2027-04-18', to: '2027-04-30', off: true },
  { id: 'shoahEve', from: '2027-05-03', to: '2027-05-03', until: '18:00' },
  { id: 'shoah', from: '2027-05-04', to: '2027-05-04', pause: ['11:00', '12:00'] },
  { id: 'zikaronEve', from: '2027-05-10', to: '2027-05-10', until: '18:00', pause: ['11:00', '12:00'] },
  { id: 'atzmaut', from: '2027-05-11', to: '2027-05-12', off: true },
  { id: 'yerushalayimEve', from: '2027-06-03', to: '2027-06-03', until: '18:00' },
  { id: 'yerushalayim', from: '2027-06-04', to: '2027-06-04', off: true },
  { id: 'shavuot', from: '2027-06-10', to: '2027-06-11', off: true },
];
