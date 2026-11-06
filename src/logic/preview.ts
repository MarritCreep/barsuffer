import type { Course, Semester } from '../data/types';
import { computeMisery } from './misery';
import { collectMeetings } from './schedule';
import { selectSection, type Plan } from './selection';

/**
 * Насколько изменится индекс страдания (стандартный, без ограничения в 100),
 * если выбрать эту группу. Для подсказок «+8» / «−3» на «призраках».
 */
export function miseryDelta(
  plan: Plan,
  courses: ReadonlyMap<string, Course>,
  semester: Semester,
  course: Course,
  sectionNumber: string,
): number {
  const before = computeMisery(collectMeetings(plan, courses, semester)).raw;
  const next: Plan = {
    ...plan,
    courses: plan.courses.map((c) =>
      c.courseId === course.courseId
        ? { ...c, hidden: false, picks: selectSection(course, c.picks, sectionNumber) }
        : c,
    ),
  };
  const after = computeMisery(collectMeetings(next, courses, semester)).raw;
  return after - before;
}
