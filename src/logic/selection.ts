import { SESSION_TYPE_ORDER, type Course, type Section, type SessionType } from '../data/types';

/** Выбранная группа для каждого типа занятий курса: { lecture: "18", exercise: "20" }. */
export type Picks = Partial<Record<SessionType, string>>;

export interface PlannedCourse {
  courseId: string;
  /** Индекс цвета в палитре; назначается при добавлении и не меняется. */
  color: number;
  picks: Picks;
  /** Курс нельзя не взять в этом семестре — автоподбор всегда его включает. */
  required?: boolean;
  /** Курс временно скрыт: остаётся в списке, но не стоит в сетке и не считается. */
  hidden?: boolean;
}

/** Расписание пользователя. Хранит только стабильные номера курсов и групп. */
export interface Plan {
  v: 1;
  courses: PlannedCourse[];
}

export const EMPTY_PLAN: Plan = { v: 1, courses: [] };

export const PALETTE_SIZE = 10;

export function findSection(course: Course, sectionNumber: string): Section | undefined {
  return course.sections.find((s) => s.sectionNumber === sectionNumber);
}

/** Типы занятий, которые есть у курса: по одной группе каждого типа нужно выбрать. */
export function requiredTypes(course: Course): SessionType[] {
  const present = new Set(course.sections.map((s) => s.type));
  return SESSION_TYPE_ORDER.filter((t) => present.has(t));
}

export function sectionsOfType(course: Course, type: SessionType): Section[] {
  return course.sections.filter((s) => s.type === type);
}

/**
 * Совместима ли группа с остальным выбором.
 * Группа с linkedTo требует, чтобы среди выбранных групп других типов была одна из указанных.
 */
export function isCompatible(section: Section, picks: Picks): boolean {
  if (!section.linkedTo || section.linkedTo.length === 0) return true;
  return Object.entries(picks).some(
    ([type, num]) => type !== section.type && num !== undefined && section.linkedTo!.includes(num),
  );
}

/**
 * Выбрать группу. Если она привязана к другой группе (упражнение → лекция),
 * та выбирается автоматически; ставшие несовместимыми группы снимаются.
 */
export function selectSection(course: Course, picks: Picks, sectionNumber: string): Picks {
  const section = findSection(course, sectionNumber);
  if (!section) return picks;

  const next: Picks = { ...picks, [section.type]: section.sectionNumber };

  if (!isCompatible(section, next) && section.linkedTo) {
    const parent = section.linkedTo.map((n) => findSection(course, n)).find(Boolean);
    if (parent) next[parent.type] = parent.sectionNumber;
  }

  for (const [type, num] of Object.entries(next) as [SessionType, string][]) {
    if (num === section.sectionNumber) continue;
    if (parentOf(section, course)?.sectionNumber === num) continue;
    const other = findSection(course, num);
    if (other && !isCompatible(other, next)) delete next[type];
  }
  return next;
}

function parentOf(section: Section, course: Course): Section | undefined {
  if (!section.linkedTo) return undefined;
  return course.sections.find(
    (s) => section.linkedTo!.includes(s.sectionNumber) && s.type !== section.type,
  );
}

/** Нажатие на уже выбранную группу снимает выбор; иначе выбирает её. */
export function toggleSection(course: Course, picks: Picks, sectionNumber: string): Picks {
  const section = findSection(course, sectionNumber);
  if (!section) return picks;
  if (picks[section.type] === sectionNumber) {
    const next = { ...picks };
    delete next[section.type];
    // Группы, привязанные к снятой, тоже становятся невалидными.
    for (const [type, num] of Object.entries(next) as [SessionType, string][]) {
      const other = findSection(course, num);
      if (other && !isCompatible(other, next)) delete next[type];
    }
    return next;
  }
  return selectSection(course, picks, sectionNumber);
}

/** Автовыбор: для типов, где всего одна группа, она выбирается сразу. */
export function autoPicks(course: Course): Picks {
  let picks: Picks = {};
  for (const type of requiredTypes(course)) {
    const options = sectionsOfType(course, type);
    if (options.length === 1) picks = selectSection(course, picks, options[0]!.sectionNumber);
  }
  return picks;
}

/** Типы, для которых группа ещё не выбрана. */
export function missingTypes(course: Course, picks: Picks): SessionType[] {
  return requiredTypes(course).filter((t) => picks[t] === undefined);
}

/** Наименьший свободный индекс цвета. */
export function nextColor(plan: Plan): number {
  const used = new Set(plan.courses.map((c) => c.color));
  for (let i = 0; i < PALETTE_SIZE; i++) if (!used.has(i)) return i;
  return plan.courses.length % PALETTE_SIZE;
}
