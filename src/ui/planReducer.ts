import type { Course } from '../data/types';
import {
  autoPicks,
  nextColor,
  selectSection,
  toggleSection,
  type PersonalBlock,
  type Picks,
  type Plan,
  type PlannedCourse,
} from '../logic/selection';

export type PlanAction =
  | { kind: 'add'; course: Course; sectionNumber?: string }
  | { kind: 'remove'; courseId: string }
  | { kind: 'toggle'; course: Course; sectionNumber: string }
  | { kind: 'select'; course: Course; sectionNumber: string }
  | { kind: 'setRequired'; courseId: string; required: boolean }
  | { kind: 'setHidden'; courseId: string; hidden: boolean }
  | { kind: 'applyAuto'; picks: Record<string, Picks>; skipped: string[] }
  | { kind: 'addBlock'; block: PersonalBlock }
  | { kind: 'removeBlock'; id: string }
  | { kind: 'clear' };

/** Меняет один курс; если ничего не изменилось — возвращает тот же план (для истории это no-op). */
function update(plan: Plan, courseId: string, fn: (c: PlannedCourse) => PlannedCourse): Plan {
  const target = plan.courses.find((c) => c.courseId === courseId);
  if (!target) return plan;
  const next = fn(target);
  if (next === target) return plan;
  return { ...plan, courses: plan.courses.map((c) => (c === target ? next : c)) };
}

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
    case 'remove':
      if (!plan.courses.some((c) => c.courseId === action.courseId)) return plan;
      return { ...plan, courses: plan.courses.filter((c) => c.courseId !== action.courseId) };
    case 'toggle':
      // Работа с группами скрытого курса возвращает его в расписание.
      return update(plan, action.course.courseId, (c) => ({
        ...c,
        hidden: false,
        picks: toggleSection(action.course, c.picks, action.sectionNumber),
      }));
    case 'select':
      return update(plan, action.course.courseId, (c) => ({
        ...c,
        hidden: false,
        picks: selectSection(action.course, c.picks, action.sectionNumber),
      }));
    case 'setRequired':
      return update(plan, action.courseId, (c) =>
        Boolean(c.required) === action.required ? c : { ...c, required: action.required },
      );
    case 'setHidden':
      return update(plan, action.courseId, (c) =>
        Boolean(c.hidden) === action.hidden ? c : { ...c, hidden: action.hidden },
      );
    case 'applyAuto': {
      const skipped = new Set(action.skipped);
      return {
        ...plan,
        courses: plan.courses.map((c) => {
          const picks = action.picks[c.courseId];
          if (picks) return { ...c, picks, hidden: false };
          if (skipped.has(c.courseId)) return { ...c, hidden: true };
          return c;
        }),
      };
    }
    case 'addBlock':
      return { ...plan, blocks: [...(plan.blocks ?? []), action.block] };
    case 'removeBlock':
      if (!plan.blocks?.some((b) => b.id === action.id)) return plan;
      return { ...plan, blocks: plan.blocks.filter((b) => b.id !== action.id) };
    case 'clear':
      // Блокировки — это не курсы, «Clear all» их не трогает.
      if (plan.courses.length === 0) return plan;
      return { ...plan, courses: [] };
  }
}
