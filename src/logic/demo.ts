import type { Course } from '../data/types';
import { autoPicks, selectSection, type Plan, type PlannedCourse } from './selection';

/**
 * Демо-расписание для первого знакомства: несколько курсов обоих семестров, годовой курс и одна
 * блокировка, чтобы сразу было видно накладку, окна, «Беги!» и индекс.
 */
export const DEMO_COURSES: { courseId: string; sections?: string[] }[] = [
  { courseId: '711081', sections: ['18', '20'] },
  { courseId: '71204', sections: ['18', '19'] },
  { courseId: '63011', sections: ['18'] },
  { courseId: '711140', sections: ['19'] },
  { courseId: '63254' },
  { courseId: '63938' },
  { courseId: '99003' },
  { courseId: '711082' },
  { courseId: '63009', sections: ['18'] },
  { courseId: '71205' },
  { courseId: '99001', sections: ['01', '03'] },
];

export function demoPlan(catalog: ReadonlyMap<string, Course>): Plan {
  const courses: PlannedCourse[] = [];
  for (const item of DEMO_COURSES) {
    const course = catalog.get(item.courseId);
    if (!course) continue;
    let picks = autoPicks(course);
    for (const num of item.sections ?? []) picks = selectSection(course, picks, num);
    courses.push({ courseId: course.courseId, color: courses.length, picks });
  }
  return {
    v: 1,
    courses,
    blocks: [{ id: 'demo-gym', label: 'Gym', day: 3, startTime: '18:00', endTime: '19:30' }],
  };
}
