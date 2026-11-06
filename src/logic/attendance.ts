import type { SessionType } from '../data/types';
import type { PlacedMeeting } from './schedule';
import type { Occurrence } from './sessions';

/**
 * Посещаемость и милуим. Студент отмечает пропуски (или даты резервной службы), а мы считаем,
 * сколько ещё можно пропустить при требовании N% посещаемости (по умолчанию 80% — так во многих
 * курсах, но точное правило — в силлабусе). Считается по каждой группе отдельно (лекция, תרגיל…).
 */

export interface MiluimPeriod {
  id: string;
  /** YYYY-MM-DD включительно. */
  from: string;
  to: string;
}

export interface AttendanceLog {
  v: 1;
  /** Ключи встреч (`occurrenceKey`), на которых студента не было. */
  absent: string[];
  miluim: MiluimPeriod[];
  /** Правило посещаемости по курсу; нет записи — DEFAULT_REQUIRED процентов. */
  rules: Record<string, AttendanceRule>;
}

/**
 * pct — не меньше N% встреч; abs — не больше N пропусков за семестр (так в Оламот: 2);
 * none — посещаемость не проверяется.
 */
export type AttendanceRule = { kind: 'pct'; value: number } | { kind: 'abs'; value: number } | { kind: 'none' };

export const DEFAULT_REQUIRED = 80;
export const OLAMOT_RULE: AttendanceRule = { kind: 'abs', value: 2 };
export const EMPTY_LOG: AttendanceLog = { v: 1, absent: [], miluim: [], rules: {} };

export type AttendanceStatus = 'ok' | 'tight' | 'over' | 'free';

export interface SectionAttendance {
  courseId: string;
  courseName: string;
  sectionNumber: string;
  type: SessionType;
  /** Встреч в семестре (без праздников). */
  total: number;
  /** Уже прошло. */
  past: number;
  /** Пропущено вручную. */
  missedMarked: number;
  /** Пропадёт из-за милуим (не отмеченные вручную). */
  missedMiluim: number;
  missed: number;
  rule: AttendanceRule;
  /** Можно пропустить всего при этом правиле. */
  allowed: number;
  /** Сколько ещё можно пропустить (меньше нуля — уже перебор). */
  left: number;
  /** Посещаемость за семестр, если всё оставшееся посетить: 0…1. */
  bestCase: number;
  status: AttendanceStatus;
}

export function inMiluim(date: string, periods: readonly MiluimPeriod[]): MiluimPeriod | undefined {
  return periods.find((p) => p.from <= date && date <= p.to);
}

/** Встреча прошла к моменту now (дата раньше сегодняшней или сегодня, но уже закончилась). */
export function isPast(o: Occurrence, today: string, nowMinutes: number): boolean {
  return o.date < today || (o.date === today && o.meeting.end <= nowMinutes);
}

export function sectionAttendance(
  held: readonly Occurrence[],
  log: AttendanceLog,
  today: string,
  nowMinutes: number,
): SectionAttendance[] {
  const absent = new Set(log.absent);
  const groups = new Map<string, Occurrence[]>();
  for (const o of held) {
    if (o.meeting.isBlock || o.cancelledBy) continue;
    const id = `${o.meeting.courseId}|${o.meeting.sectionNumber}`;
    groups.set(id, [...(groups.get(id) ?? []), o]);
  }

  const result: SectionAttendance[] = [];
  for (const list of groups.values()) {
    const m: PlacedMeeting = list[0]!.meeting;
    const rule = log.rules[m.courseId] ?? { kind: 'pct', value: DEFAULT_REQUIRED };
    const total = list.length;
    const missedMarked = list.filter((o) => absent.has(o.key)).length;
    const missedMiluim = list.filter((o) => !absent.has(o.key) && inMiluim(o.date, log.miluim)).length;
    const missed = missedMarked + missedMiluim;
    const allowed =
      rule.kind === 'none'
        ? total
        : rule.kind === 'abs'
          ? Math.min(total, rule.value)
          : Math.floor((total * (100 - rule.value)) / 100 + 1e-9);
    const left = allowed - missed;
    result.push({
      courseId: m.courseId,
      courseName: m.courseName,
      sectionNumber: m.sectionNumber,
      type: m.type,
      total,
      past: list.filter((o) => isPast(o, today, nowMinutes)).length,
      missedMarked,
      missedMiluim,
      missed,
      rule,
      allowed,
      left,
      bestCase: total === 0 ? 1 : (total - missed) / total,
      status: rule.kind === 'none' ? 'free' : left < 0 ? 'over' : left <= 1 ? 'tight' : 'ok',
    });
  }
  return result.sort((a, b) => a.courseName.localeCompare(b.courseName) || a.sectionNumber.localeCompare(b.sectionNumber));
}

export interface MiluimImpact {
  period: MiluimPeriod;
  /** Встреч пропадёт за период. */
  sessions: number;
  /** По курсам: courseId → число встреч. */
  byCourse: Map<string, { courseName: string; count: number }>;
  /** Учебных дней (с парами) внутри периода. */
  classDays: number;
}

export function miluimImpact(held: readonly Occurrence[], periods: readonly MiluimPeriod[]): MiluimImpact[] {
  return periods.map((period) => {
    const inside = held.filter((o) => !o.meeting.isBlock && !o.cancelledBy && period.from <= o.date && o.date <= period.to);
    const byCourse = new Map<string, { courseName: string; count: number }>();
    for (const o of inside) {
      const entry = byCourse.get(o.meeting.courseId) ?? { courseName: o.meeting.courseName, count: 0 };
      entry.count++;
      byCourse.set(o.meeting.courseId, entry);
    }
    return { period, sessions: inside.length, byCourse, classDays: new Set(inside.map((o) => o.date)).size };
  });
}

/** Переключить отметку пропуска. */
export function toggleAbsent(log: AttendanceLog, key: string): AttendanceLog {
  const absent = log.absent.includes(key) ? log.absent.filter((k) => k !== key) : [...log.absent, key];
  return { ...log, absent };
}

export function isAttendanceLog(v: unknown): v is AttendanceLog {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Partial<AttendanceLog>;
  return (
    l.v === 1 &&
    Array.isArray(l.absent) &&
    l.absent.every((k) => typeof k === 'string') &&
    Array.isArray(l.miluim) &&
    l.miluim.every((p) => typeof p?.from === 'string' && typeof p?.to === 'string' && typeof p?.id === 'string') &&
    typeof l.rules === 'object' &&
    l.rules !== null
  );
}
