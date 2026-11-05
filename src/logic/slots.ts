import type { Course, Day, Section, Semester } from '../data/types';
import { overlaps, sectionMeetings, termIncludes, type PlacedMeeting, type TimeSpan } from './schedule';
import type { Plan } from './selection';
import { toMinutes } from './time';

/** Группа, у которой есть занятие в выбранном слоте сетки. */
export interface SlotOption {
  course: Course;
  section: Section;
  /** Все встречи группы в семестре (минуты от полуночи). */
  meetings: TimeSpan[];
  /** Курс уже есть в расписании (тогда группу можно сменить на эту). */
  inPlan: boolean;
  /** Сколько встреч группы пересекается с расписанием (без учёта самого курса). */
  conflicts: number;
}

/**
 * «Что влезет в окно»: все группы, у которых хотя бы одна встреча пересекает слот.
 * Уже выбранные группы не показываются — они и так стоят на сетке.
 */
export function optionsForSlot(
  courses: readonly Course[],
  plan: Plan,
  semester: Semester,
  slot: TimeSpan,
  current: readonly PlacedMeeting[],
): SlotOption[] {
  const planned = new Map(plan.courses.map((c) => [c.courseId, c]));
  const options: SlotOption[] = [];

  for (const course of courses) {
    if (!termIncludes(course.term, semester)) continue;
    const inPlan = planned.get(course.courseId);
    const others = current.filter((m) => m.courseId !== course.courseId);

    for (const section of course.sections) {
      if (inPlan?.picks[section.type] === section.sectionNumber) continue;
      const meetings: TimeSpan[] = sectionMeetings(course, section, semester).map((m) => ({
        day: m.day,
        start: toMinutes(m.startTime),
        end: toMinutes(m.endTime),
      }));
      if (!meetings.some((m) => overlaps(m, slot))) continue;
      options.push({
        course,
        section,
        meetings,
        inPlan: inPlan !== undefined,
        conflicts: meetings.filter((m) => others.some((o) => overlaps(m, o))).length,
      });
    }
  }

  // Сначала то, что встаёт без накладок; затем по времени начала и названию.
  return options.sort(
    (a, b) =>
      Number(a.conflicts > 0) - Number(b.conflicts > 0) ||
      startInSlot(a, slot) - startInSlot(b, slot) ||
      a.course.name.localeCompare(b.course.name),
  );
}

function startInSlot(option: SlotOption, slot: TimeSpan): number {
  return Math.min(...option.meetings.filter((m) => overlaps(m, slot)).map((m) => m.start));
}

/** Слот сетки: одна клетка = один час. */
export function hourSlot(day: Day, hourStart: number): TimeSpan {
  return { day, start: hourStart, end: hourStart + 60 };
}
