import { EMPTY_PLAN, type Plan } from '../logic/selection';

const PLAN_KEY = 'barsuffer:plan:v1';
const THEME_KEY = 'barsuffer:theme';

export type Theme = 'dark' | 'light';

/** Хранилище браузера может быть недоступно (приватный режим) — тогда просто не сохраняем. */
export function loadPlan(): Plan {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return EMPTY_PLAN;
    const parsed: unknown = JSON.parse(raw);
    return isPlan(parsed) ? parsed : EMPTY_PLAN;
  } catch {
    return EMPTY_PLAN;
  }
}

export function savePlan(plan: Plan): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    /* хранилище недоступно */
  }
}

export function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* хранилище недоступно */
  }
}

function isPlan(value: unknown): value is Plan {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { v?: unknown; courses?: unknown };
  const blocks = (value as { blocks?: unknown }).blocks;
  return (
    v.v === 1 &&
    (blocks === undefined || Array.isArray(blocks)) &&
    Array.isArray(v.courses) &&
    v.courses.every(
      (c: unknown) =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as { courseId?: unknown }).courseId === 'string' &&
        typeof (c as { color?: unknown }).color === 'number' &&
        typeof (c as { picks?: unknown }).picks === 'object',
    )
  );
}
