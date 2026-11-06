import type { Day } from '../data/types';
import { clusterByOverlap, type TimeSpan } from './schedule';

/**
 * Индекс страдания — стартовая формула из диздока.
 * Коэффициенты условные, их стоит настроить на реальных расписаниях.
 */
export const MISERY_WEIGHTS = {
  /** каждый день в кампусе */
  campusDay: 8,
  /** каждое занятие с началом до 09:00 */
  earlyClass: 6,
  /** каждый полный час окна между занятиями в один день */
  windowHour: 3,
  /** занятия в пятницу — один раз за неделю */
  friday: 12,
  /** каждое занятие, заканчивающееся после 18:00 */
  lateClass: 5,
} as const;

/** Веса индекса. Стандартные — MISERY_WEIGHTS; свои веса студент задаёт в автоподборе. */
export type MiseryWeights = { -readonly [K in keyof typeof MISERY_WEIGHTS]: number };

export const EARLY_BEFORE = 9 * 60;
export const LATE_AFTER = 18 * 60;
/** Окно считается, только если перерыв не короче одной клетки сетки (часа). */
export const MIN_WINDOW = 60;
export const MAX_SCORE = 100;

export type MiseryCategory = 'days' | 'early' | 'windows' | 'friday' | 'late';

export interface MiseryResult {
  score: number;
  /** Сумма до ограничения в 100. */
  raw: number;
  campusDays: number;
  earlyClasses: number;
  windowHours: number;
  hasFriday: boolean;
  lateClasses: number;
  conflictClusters: number;
  points: Record<MiseryCategory, number>;
}

/**
 * Считает индекс по встречам одного семестра.
 *
 * Накладки: если занятия пересекаются, в индексе учитывается только самое
 * «тяжёлое» из них (с наибольшими баллами за раннее начало и поздний конец),
 * а окна считаются по объединённому времени.
 */
export function computeMisery(
  meetings: readonly TimeSpan[],
  weights: MiseryWeights = MISERY_WEIGHTS,
): MiseryResult {
  const clusters = clusterByOverlap(meetings);

  let earlyClasses = 0;
  let lateClasses = 0;
  let conflictClusters = 0;
  for (const cluster of clusters) {
    if (cluster.length > 1) conflictClusters++;
    let best = { early: 0, late: 0, points: -1 };
    for (const m of cluster) {
      const early = m.start < EARLY_BEFORE ? 1 : 0;
      const late = m.end > LATE_AFTER ? 1 : 0;
      const points = early * weights.earlyClass + late * weights.lateClass;
      if (points > best.points) best = { early, late, points };
    }
    earlyClasses += best.early;
    lateClasses += best.late;
  }

  const days = new Set<Day>(meetings.map((m) => m.day));
  const hasFriday = days.has(6);

  // Окна: промежутки между объединёнными блоками одного дня.
  let windowHours = 0;
  const byDay = new Map<Day, { start: number; end: number }[]>();
  for (const cluster of clusters) {
    const day = cluster[0]!.day;
    const block = {
      start: Math.min(...cluster.map((m) => m.start)),
      end: Math.max(...cluster.map((m) => m.end)),
    };
    byDay.set(day, [...(byDay.get(day) ?? []), block]);
  }
  for (const blocks of byDay.values()) {
    for (let i = 1; i < blocks.length; i++) {
      const gap = blocks[i]!.start - blocks[i - 1]!.end;
      if (gap >= MIN_WINDOW) windowHours += Math.floor(gap / 60);
    }
  }

  const points: Record<MiseryCategory, number> = {
    days: days.size * weights.campusDay,
    early: earlyClasses * weights.earlyClass,
    windows: windowHours * weights.windowHour,
    friday: hasFriday ? weights.friday : 0,
    late: lateClasses * weights.lateClass,
  };
  const raw = Object.values(points).reduce((a, b) => a + b, 0);

  return {
    score: Math.min(MAX_SCORE, raw),
    raw,
    campusDays: days.size,
    earlyClasses,
    windowHours,
    hasFriday,
    lateClasses,
    conflictClusters,
    points,
  };
}

/** Индекс каждого дня отдельно (день в кампусе, ранние, окна, пятница, поздние) — для «карты страданий». */
export function dayMisery(
  meetings: readonly TimeSpan[],
  weights: MiseryWeights = MISERY_WEIGHTS,
): Map<Day, number> {
  const byDay = new Map<Day, TimeSpan[]>();
  for (const m of meetings) byDay.set(m.day, [...(byDay.get(m.day) ?? []), m]);
  const result = new Map<Day, number>();
  for (const [day, list] of byDay) result.set(day, computeMisery(list, weights).raw);
  return result;
}

/** Самый мучительный день недели или null, если занятий нет. */
export function hellDay(meetings: readonly TimeSpan[]): { day: Day; score: number } | null {
  let best: { day: Day; score: number } | null = null;
  for (const [day, score] of dayMisery(meetings)) {
    if (!best || score > best.score || (score === best.score && day < best.day)) best = { day, score };
  }
  return best;
}

export interface MiseryTitle {
  id: string;
  title: string;
  blurb: string;
}

/** Десять шуточных титулов. Выбор — по первому подходящему правилу. */
export const TITLES = {
  ghost: { id: 'ghost', title: 'Ghost Student', blurb: 'No classes this semester. Are you even enrolled?' },
  professional: { id: 'professional', title: 'Professional Sufferer', blurb: 'This schedule is a lifestyle, not a timetable.' },
  quantum: { id: 'quantum', title: 'Quantum Student', blurb: 'Plans to attend two classes at the same time.' },
  dream: { id: 'dream', title: 'Living the Dream', blurb: 'Suspiciously comfortable. Did you forget a course?' },
  resident: { id: 'resident', title: 'Campus Resident', blurb: 'Five days on campus. Might as well get a mailbox there.' },
  earlyBird: { id: 'earlyBird', title: 'Reluctant Early Bird', blurb: 'Sees the 08:00 sunrise more than anyone should.' },
  library: { id: 'library', title: 'Library Dweller', blurb: 'So many gaps, the library knows your name.' },
  friday: { id: 'friday', title: 'Friday Martyr', blurb: 'Classes on Friday. Everyone else is at the beach.' },
  nightOwl: { id: 'nightOwl', title: 'Night Owl Scholar', blurb: 'Leaves campus when the stars come out.' },
  balanced: { id: 'balanced', title: 'Well-Rounded Sufferer', blurb: 'A little bit of every kind of pain.' },
} satisfies Record<string, MiseryTitle>;

/** Порог, начиная с которого категория «главная» и даёт свой титул. */
const DOMINANT_MIN_POINTS = 10;

export function pickTitle(result: MiseryResult, meetingCount: number): MiseryTitle {
  if (meetingCount === 0) return TITLES.ghost;
  if (result.score >= 85) return TITLES.professional;
  if (result.conflictClusters > 0) return TITLES.quantum;
  if (result.score < 20) return TITLES.dream;
  if (result.campusDays >= 5) return TITLES.resident;

  const candidates: [number, MiseryTitle][] = [
    [result.points.friday, TITLES.friday],
    [result.points.early, TITLES.earlyBird],
    [result.points.windows, TITLES.library],
    [result.points.late, TITLES.nightOwl],
  ];
  candidates.sort((a, b) => b[0] - a[0]);
  const [topPoints, topTitle] = candidates[0]!;
  return topPoints >= DOMINANT_MIN_POINTS ? topTitle : TITLES.balanced;
}
