import type { Course, Day, Semester } from '../data/types';
import { computeMisery, MISERY_WEIGHTS, type MiseryResult, type MiseryWeights } from './misery';
import { overlaps, sectionMeetings, termIncludes, type TimeSpan } from './schedule';
import { findSection, isCompatible, requiredTypes, sectionsOfType, type Picks } from './selection';
import { toMinutes } from './time';

/**
 * Автоподбор: перебирает группы курсов и ищет расписания с наименьшим индексом страдания.
 *
 * Обязательные курсы входят в каждый вариант. Из необязательных берётся ровно
 * `optionalToTake` штук. Варианты без накладок всегда выше вариантов с накладками.
 */

/** Один допустимый набор групп курса и его встречи в семестре. */
export interface CourseOption {
  picks: Picks;
  spans: TimeSpan[];
}

export interface AutoPickRequest {
  courses: readonly Course[];
  required: ReadonlySet<string>;
  optionalToTake: number;
  semester: Semester;
  /** Сколько лучших вариантов вернуть. */
  limit?: number;
  /** Предел перебора, чтобы интерфейс не зависал на огромных каталогах. */
  maxNodes?: number;
  /** Свои веса индекса; по умолчанию стандартные. */
  weights?: MiseryWeights;
  /** Занятое время (личные блокировки): пересечение с ним считается накладкой. */
  blocked?: readonly TimeSpan[];
}

export interface AutoPickResult {
  picks: Record<string, Picks>;
  /** Курсы, вошедшие в вариант. */
  taken: string[];
  /** Необязательные курсы, которые в вариант не вошли. */
  skipped: string[];
  misery: MiseryResult;
  conflicts: number;
  spans: TimeSpan[];
  /** courseId для каждой встречи из spans (тот же индекс). */
  owners: string[];
  cost: number;
}

export interface AutoPickOutcome {
  results: AutoPickResult[];
  /** Перебор остановлен по пределу — показаны лучшие из найденных. */
  truncated: boolean;
  /** Курсы, для которых в семестре нет ни одного допустимого набора групп. */
  unschedulable: string[];
}

/** Штраф за накладку: любая накладка хуже любого индекса страдания. */
export const CONFLICT_COST = 1000;

/** Все допустимые наборы групп курса (по одной группе каждого типа, с учётом linkedTo). */
export function courseOptions(course: Course, semester: Semester): CourseOption[] {
  if (!termIncludes(course.term, semester)) return [];

  let combos: Picks[] = [{}];
  for (const type of requiredTypes(course)) {
    const next: Picks[] = [];
    for (const picks of combos) {
      for (const section of sectionsOfType(course, type)) {
        next.push({ ...picks, [type]: section.sectionNumber });
      }
    }
    combos = next;
  }

  const valid = combos.filter((picks) =>
    Object.values(picks).every((num) => {
      const section = num === undefined ? undefined : findSection(course, num);
      return section !== undefined && isCompatible(section, picks);
    }),
  );

  // Наборы с одинаковым временем неотличимы для индекса — оставляем первый.
  const seen = new Set<string>();
  const options: CourseOption[] = [];
  for (const picks of valid) {
    const spans = optionSpans(course, picks, semester);
    const key = signature(spans);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ picks, spans });
  }
  return options;
}

function optionSpans(course: Course, picks: Picks, semester: Semester): TimeSpan[] {
  const spans: TimeSpan[] = [];
  for (const num of Object.values(picks)) {
    const section = num === undefined ? undefined : findSection(course, num);
    if (!section) continue;
    for (const m of sectionMeetings(course, section, semester)) {
      spans.push({ day: m.day, start: toMinutes(m.startTime), end: toMinutes(m.endTime) });
    }
  }
  return spans;
}

function signature(spans: readonly TimeSpan[]): string {
  return spans
    .map((s) => `${s.day}:${s.start}-${s.end}`)
    .sort()
    .join(',');
}

interface Item {
  course: Course;
  options: CourseOption[];
  required: boolean;
}

export function autoPick(request: AutoPickRequest): AutoPickOutcome {
  const { semester, required } = request;
  const limit = request.limit ?? 5;
  const maxNodes = request.maxNodes ?? 200_000;
  const weights = request.weights ?? MISERY_WEIGHTS;
  const blocked = request.blocked ?? [];

  const unschedulable: string[] = [];
  const items: Item[] = [];
  for (const course of request.courses) {
    if (!termIncludes(course.term, semester)) continue;
    const options = courseOptions(course, semester);
    if (options.length === 0) {
      unschedulable.push(course.courseId);
      continue;
    }
    items.push({ course, options, required: required.has(course.courseId) });
  }

  // Сначала обязательные, затем необязательные; внутри — от меньшего числа вариантов.
  items.sort(
    (a, b) => Number(b.required) - Number(a.required) || a.options.length - b.options.length,
  );
  for (const item of items) item.options.sort((a, b) => optionWeight(a) - optionWeight(b));

  const optionalCount = items.filter((i) => !i.required).length;
  const k = Math.max(0, Math.min(request.optionalToTake, optionalCount));
  // Сколько необязательных курсов осталось после позиции i (для отсечения).
  const optionalAfter: number[] = new Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i--) {
    optionalAfter[i] = optionalAfter[i + 1]! + (items[i]!.required ? 0 : 1);
  }

  const results: AutoPickResult[] = [];
  const signatures = new Map<string, number>();
  let nodes = 0;
  let truncated = false;

  const chosen: TimeSpan[] = [];
  const owners: string[] = [];
  const picks: Record<string, Picks> = {};
  const taken: string[] = [];
  const dayCount = new Map<Day, number>();

  const worstCost = () => (results.length < limit ? Infinity : results[results.length - 1]!.cost);

  /** Нижняя граница стоимости: дни, пятница и накладки только растут при добавлении курсов. */
  const lowerBound = (conflicts: number) =>
    conflicts * CONFLICT_COST +
    dayCount.size * weights.campusDay +
    (dayCount.has(6) ? weights.friday : 0);

  const record = (conflicts: number) => {
    const misery = computeMisery(chosen, weights);
    const cost = conflicts * CONFLICT_COST + misery.raw;
    if (cost > worstCost()) return;
    const key = `${[...taken].sort().join('|')}#${signature(chosen)}`;
    const existing = signatures.get(key);
    if (existing !== undefined && existing <= cost) return;
    signatures.set(key, cost);

    const takenSet = new Set(taken);
    results.push({
      picks: structuredClone(picks),
      taken: [...taken],
      skipped: items.filter((i) => !i.required && !takenSet.has(i.course.courseId)).map((i) => i.course.courseId),
      misery,
      conflicts,
      spans: [...chosen],
      owners: [...owners],
      cost,
    });
    results.sort(compareResults);
    if (results.length > limit) results.length = limit;
  };

  const dfs = (index: number, conflicts: number, optionalTaken: number) => {
    if (truncated) return;
    if (++nodes > maxNodes) {
      truncated = true;
      return;
    }
    if (optionalTaken + optionalAfter[index]! < k) return;
    if (lowerBound(conflicts) > worstCost()) return;

    if (index === items.length) {
      if (optionalTaken === k) record(conflicts);
      return;
    }

    const item = items[index]!;
    const canTake = item.required || optionalTaken < k;

    if (canTake) {
      for (const option of item.options) {
        let added = 0;
        for (const span of option.spans) {
          for (const other of chosen) if (overlaps(span, other)) added++;
          for (const busy of blocked) if (overlaps(span, busy)) added++;
          chosen.push(span);
          owners.push(item.course.courseId);
          dayCount.set(span.day, (dayCount.get(span.day) ?? 0) + 1);
        }
        picks[item.course.courseId] = option.picks;
        taken.push(item.course.courseId);

        dfs(index + 1, conflicts + added, optionalTaken + (item.required ? 0 : 1));

        taken.pop();
        delete picks[item.course.courseId];
        for (let i = 0; i < option.spans.length; i++) {
          const span = chosen.pop()!;
          owners.pop();
          const left = dayCount.get(span.day)! - 1;
          if (left === 0) dayCount.delete(span.day);
          else dayCount.set(span.day, left);
        }
      }
    }

    if (!item.required) dfs(index + 1, conflicts, optionalTaken);
  };

  dfs(0, 0, 0);
  return { results, truncated, unschedulable };
}

/** Эвристика порядка перебора: сначала наборы, которые занимают меньше дней. */
function optionWeight(option: CourseOption): number {
  return new Set(option.spans.map((s) => s.day)).size;
}

function compareResults(a: AutoPickResult, b: AutoPickResult): number {
  return (
    a.cost - b.cost ||
    a.misery.campusDays - b.misery.campusDays ||
    a.misery.windowHours - b.misery.windowHours ||
    signature(a.spans).localeCompare(signature(b.spans))
  );
}
