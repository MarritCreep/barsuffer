import type { Course, Day, Meeting, Section, Semester, SessionType, Term } from '../data/types';
import { findSection, type Plan } from './selection';
import { toMinutes } from './time';

/** Одна встреча, готовая для сетки и расчётов. Время в минутах от полуночи. */
export interface PlacedMeeting {
  /** Уникальный ключ: курс-группа-номер встречи. */
  key: string;
  courseId: string;
  courseName: string;
  sectionNumber: string;
  type: SessionType;
  lecturer?: string;
  day: Day;
  start: number;
  end: number;
  building?: string;
  room?: string;
  color: number;
  isDemo: boolean;
  /** Личная блокировка, а не занятие: не входит в индекс и часы, но даёт накладки. */
  isBlock?: boolean;
}

export interface TimeSpan {
  day: Day;
  start: number;
  end: number;
}

export function termIncludes(term: Term, semester: Semester): boolean {
  return term === 'year' || term === semester;
}

/** Встречи группы в данном семестре (учитывает годовые курсы и встречи одного семестра). */
export function sectionMeetings(course: Course, section: Section, semester: Semester): Meeting[] {
  if (!termIncludes(course.term, semester)) return [];
  return section.schedule.filter((m) => m.semester === undefined || m.semester === semester);
}

export function placeSection(
  course: Course,
  section: Section,
  semester: Semester,
  color: number,
): PlacedMeeting[] {
  return sectionMeetings(course, section, semester).map((m, i) => ({
    key: `${course.courseId}-${section.sectionNumber}-${i}`,
    courseId: course.courseId,
    courseName: course.name,
    sectionNumber: section.sectionNumber,
    type: section.type,
    lecturer: section.lecturer,
    day: m.day,
    start: toMinutes(m.startTime),
    end: toMinutes(m.endTime),
    building: m.building,
    room: m.room,
    color,
    isDemo: Boolean(section.isDemo || course.isDemo),
  }));
}

/** Все встречи выбранных групп в семестре. */
export function collectMeetings(
  plan: Plan,
  courses: ReadonlyMap<string, Course>,
  semester: Semester,
): PlacedMeeting[] {
  const result: PlacedMeeting[] = [];
  for (const planned of plan.courses) {
    const course = courses.get(planned.courseId);
    if (!course || planned.hidden) continue;
    for (const num of Object.values(planned.picks)) {
      const section = num === undefined ? undefined : findSection(course, num);
      if (section) result.push(...placeSection(course, section, semester, planned.color));
    }
  }
  return result;
}

/** Выбранные группы без фиксированного времени (онлайн и т. п.) в семестре. */
export function collectUnscheduled(
  plan: Plan,
  courses: ReadonlyMap<string, Course>,
  semester: Semester,
): { course: Course; section: Section; color: number }[] {
  const result: { course: Course; section: Section; color: number }[] = [];
  for (const planned of plan.courses) {
    const course = courses.get(planned.courseId);
    if (!course || planned.hidden || !termIncludes(course.term, semester)) continue;
    for (const num of Object.values(planned.picks)) {
      const section = num === undefined ? undefined : findSection(course, num);
      if (section && section.schedule.length === 0) {
        result.push({ course, section, color: planned.color });
      }
    }
  }
  return result;
}

/** Пересекаются ли интервалы. Стык (10–12 и 12–14) — не накладка. */
export function overlaps(a: TimeSpan, b: TimeSpan): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

export interface Conflict {
  a: PlacedMeeting;
  b: PlacedMeeting;
}

/** Все пары пересекающихся встреч. */
export function findConflicts(meetings: readonly PlacedMeeting[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const sorted = [...meetings].sort((x, y) => x.day - y.day || x.start - y.start);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      // Отсортировано по дню и началу: дальше пересечений с `a` быть не может.
      if (b.day !== a.day || b.start >= a.end) break;
      conflicts.push({ a, b });
    }
  }
  return conflicts;
}

/**
 * Группирует встречи одного дня в «кластеры» — цепочки пересекающихся интервалов.
 * Встречи, не пересекающиеся ни с кем, образуют кластер из одного элемента.
 */
export function clusterByOverlap<T extends TimeSpan>(items: readonly T[]): T[][] {
  const clusters: T[][] = [];
  const sorted = [...items].sort((x, y) => x.day - y.day || x.start - y.start || x.end - y.end);
  let current: T[] = [];
  let currentEnd = -1;
  let currentDay: Day | undefined;
  for (const item of sorted) {
    if (current.length > 0 && item.day === currentDay && item.start < currentEnd) {
      current.push(item);
      currentEnd = Math.max(currentEnd, item.end);
    } else {
      if (current.length > 0) clusters.push(current);
      current = [item];
      currentEnd = item.end;
      currentDay = item.day;
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/** Раскладка по дорожкам для сетки: пересекающиеся блоки встают рядом. */
export function assignLanes<T extends TimeSpan>(
  items: readonly T[],
): { item: T; lane: number; lanes: number }[] {
  const result: { item: T; lane: number; lanes: number }[] = [];
  for (const cluster of clusterByOverlap(items)) {
    const laneEnds: number[] = [];
    const placed: { item: T; lane: number }[] = [];
    for (const item of cluster) {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      placed.push({ item, lane });
    }
    for (const p of placed) result.push({ ...p, lanes: laneEnds.length });
  }
  return result;
}
