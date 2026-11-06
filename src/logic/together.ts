import { DAYS, type Day } from '../data/types';
import type { PlacedMeeting, TimeSpan } from './schedule';

/**
 * Сравнение с другом: общие пары и время, когда свободны оба.
 * Свободное время ищется в рабочем дне 08:00–20:00; «в кампусе» — если в этот день пары у обоих
 * и промежуток лежит внутри дня каждого (между первой и последней парой).
 */

export const DAY_START = 8 * 60;
export const DAY_END = 20 * 60;
export const MIN_FREE = 30;

export interface FreeSlot extends TimeSpan {
  /** Оба уже в кампусе (окно у обоих) — идеально для кофе. */
  onCampus: boolean;
}

export interface SharedClass {
  courseId: string;
  courseName: string;
  sectionNumber: string;
  type: PlacedMeeting['type'];
  day: Day;
  start: number;
  end: number;
}

export interface Together {
  shared: SharedClass[];
  /** Общие пары по курсу, но в разных группах. */
  sameCourse: string[];
  free: FreeSlot[];
  /** Дни, когда в кампусе оба. */
  bothOnCampus: Day[];
  /** Дни, когда свободны оба (ни у кого нет занятий). */
  bothOff: Day[];
}

/** Объединить занятые промежутки дня. */
function busyUnion(spans: readonly TimeSpan[]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: [number, number][] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last[1]) last[1] = Math.max(last[1], s.end);
    else out.push([s.start, s.end]);
  }
  return out;
}

function campusSpan(spans: readonly TimeSpan[]): [number, number] | null {
  if (spans.length === 0) return null;
  return [Math.min(...spans.map((s) => s.start)), Math.max(...spans.map((s) => s.end))];
}

export function compareSchedules(mine: readonly PlacedMeeting[], theirs: readonly PlacedMeeting[]): Together {
  const shared: SharedClass[] = [];
  for (const a of mine) {
    if (a.isBlock) continue;
    const b = theirs.find(
      (x) => !x.isBlock && x.courseId === a.courseId && x.sectionNumber === a.sectionNumber && x.day === a.day && x.start === a.start,
    );
    if (b) shared.push({ courseId: a.courseId, courseName: a.courseName, sectionNumber: a.sectionNumber, type: a.type, day: a.day, start: a.start, end: a.end });
  }
  const sharedIds = new Set(shared.map((s) => s.courseId));
  const theirIds = new Set(theirs.filter((m) => !m.isBlock).map((m) => m.courseId));
  const sameCourse = [...new Set(mine.filter((m) => !m.isBlock && theirIds.has(m.courseId) && !sharedIds.has(m.courseId)).map((m) => m.courseId))];

  const free: FreeSlot[] = [];
  const bothOnCampus: Day[] = [];
  const bothOff: Day[] = [];
  for (const day of DAYS) {
    const a = mine.filter((m) => m.day === day);
    const b = theirs.filter((m) => m.day === day);
    const aClasses = a.filter((m) => !m.isBlock);
    const bClasses = b.filter((m) => !m.isBlock);
    if (aClasses.length === 0 && bClasses.length === 0 && a.length === 0 && b.length === 0) {
      if (day !== 6) bothOff.push(day);
    }
    const spanA = campusSpan(aClasses);
    const spanB = campusSpan(bClasses);
    if (spanA && spanB) bothOnCampus.push(day);

    // Свободные промежутки = рабочий день минус занятость обоих.
    let cursor = DAY_START;
    const busy = busyUnion([...a, ...b]);
    const gaps: [number, number][] = [];
    for (const [s, e] of busy) {
      if (s > cursor) gaps.push([cursor, Math.min(s, DAY_END)]);
      cursor = Math.max(cursor, e);
      if (cursor >= DAY_END) break;
    }
    if (cursor < DAY_END) gaps.push([cursor, DAY_END]);

    for (const [s, e] of gaps) {
      if (e - s < MIN_FREE) continue;
      const onCampus =
        spanA !== null && spanB !== null && s >= Math.max(spanA[0], spanB[0]) && e <= Math.min(spanA[1], spanB[1]);
      // Пятница: только если хоть у кого-то там что-то есть, иначе это просто выходной.
      if (day === 6 && a.length === 0 && b.length === 0) continue;
      free.push({ day, start: s, end: e, onCampus });
    }
  }
  return { shared, sameCourse, free, bothOnCampus, bothOff };
}
