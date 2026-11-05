import type { Course } from '../data/types';
import { autoPicks, nextColor, selectSection, toggleSection, type Plan } from '../logic/selection';

export type PlanAction =
  | { kind: 'add'; course: Course; sectionNumber?: string }
  | { kind: 'remove'; courseId: string }
  | { kind: 'toggle'; course: Course; sectionNumber: string }
  | { kind: 'select'; course: Course; sectionNumber: string }
  | { kind: 'clear' };

export function planReducer(plan: Plan, action: PlanAction): Plan {
  switch (action.kind) {
    case 'add': {
      if (plan.courses.some((c) => c.courseId === action.course.courseId)) return plan;
      const base = autoPicks(action.course);
      const picks = action.sectionNumber ? selectSection(action.course, base, action.sectionNumber) : base;
      return {
        ...plan,
        courses: [...plan.courses, { courseId: action.course.courseId, color: nextColor(plan), picks }],
      };
    }
    case 'select':
      return {
        ...plan,
        courses: plan.courses.map((c) =>
          c.courseId === action.course.courseId
            ? { ...c, picks: selectSection(action.course, c.picks, action.sectionNumber) }
            : c,
        ),
      };
    case 'remove':
      return { ...plan, courses: plan.courses.filter((c) => c.courseId !== action.courseId) };
    case 'toggle':
      return {
        ...plan,
        courses: plan.courses.map((c) =>
          c.courseId === action.course.courseId
            ? { ...c, picks: toggleSection(action.course, c.picks, action.sectionNumber) }
            : c,
        ),
      };
    case 'clear':
      return { ...plan, courses: [] };
  }
}
