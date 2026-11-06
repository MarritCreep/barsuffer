import { EMPTY_LOG, isAttendanceLog, type AttendanceLog } from '../logic/attendance';
import { sanitizeDegree, type DegreeState } from '../logic/degree';
import { isExamEntry, type ExamEntry } from '../logic/exams';
import { DEFAULT_PREP_MIN, DEFAULT_SLEEP_HOURS } from '../logic/wake';

/** Хранилище новых инструментов: всё в localStorage этого браузера, никуда не отправляется. */
export const KEYS = {
  attendance: 'barsuffer:attendance:v1',
  exams: 'barsuffer:exams:v1',
  degree: 'barsuffer:degree:v1',
  friends: 'barsuffer:friends:v1',
  wake: 'barsuffer:wake:v1',
  tour: 'barsuffer:tour:v1',
} as const;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно */
  }
}

export function loadAttendance(): AttendanceLog {
  const v = read(KEYS.attendance);
  return isAttendanceLog(v) ? v : EMPTY_LOG;
}

export function loadExams(): ExamEntry[] {
  const v = read(KEYS.exams);
  return Array.isArray(v) ? v.filter(isExamEntry) : [];
}

export function loadDegree(): DegreeState {
  return sanitizeDegree(read(KEYS.degree));
}

/** Сохранённые друзья: имя и полезная нагрузка ссылки (как в #friend=…). */
export interface SavedFriend {
  id: string;
  name: string;
  payload: string;
  savedAt: string;
}

export function loadFriends(): SavedFriend[] {
  const v = read(KEYS.friends);
  return Array.isArray(v)
    ? v.filter(
        (f): f is SavedFriend =>
          typeof f?.id === 'string' && typeof f.name === 'string' && typeof f.payload === 'string' && typeof f.savedAt === 'string',
      )
    : [];
}

export interface WakePrefs {
  prepMinutes: number;
  sleepHours: number;
}

export function loadWake(): WakePrefs {
  const v = read(KEYS.wake) as Partial<WakePrefs> | null;
  const ok = (x: unknown, lo: number, hi: number) => typeof x === 'number' && x >= lo && x <= hi;
  return {
    prepMinutes: ok(v?.prepMinutes, 0, 240) ? v!.prepMinutes! : DEFAULT_PREP_MIN,
    sleepHours: ok(v?.sleepHours, 3, 12) ? v!.sleepHours! : DEFAULT_SLEEP_HOURS,
  };
}

export function tourSeen(): boolean {
  return read(KEYS.tour) === true;
}

export function markTourSeen(): void {
  write(KEYS.tour, true);
}
