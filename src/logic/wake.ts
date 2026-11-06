import type { Day } from '../data/types';
import type { TimeSpan } from './schedule';

/**
 * Будильник: первая пара − дорога − сборы = подъём; подъём − сон = когда ложиться.
 * Сборы и сон — настройки студента.
 */

export const DEFAULT_PREP_MIN = 45;
export const DEFAULT_SLEEP_HOURS = 8;
/** Запас, чтобы дойти от ворот до аудитории. */
export const ARRIVAL_BUFFER_MIN = 10;

export type WakeMood = 'brutal' | 'early' | 'normal' | 'luxury';

export interface WakePlan {
  day: Day;
  firstClass: number;
  leave: number;
  wake: number;
  /** Минуты от полуночи предыдущего дня (может быть > 24 ч — тогда это уже «после полуночи»). */
  bedtime: number;
  mood: WakeMood;
}

export function moodOf(wake: number): WakeMood {
  if (wake < 6 * 60) return 'brutal';
  if (wake < 7 * 60) return 'early';
  if (wake < 8 * 60 + 30) return 'normal';
  return 'luxury';
}

const mod = (n: number) => ((n % 1440) + 1440) % 1440;

export function wakeFor(
  meetings: readonly TimeSpan[],
  day: Day,
  opts: { commuteMinutes: number; prepMinutes?: number; sleepHours?: number },
): WakePlan | null {
  const today = meetings.filter((m) => m.day === day);
  if (today.length === 0) return null;
  const firstClass = Math.min(...today.map((m) => m.start));
  const leave = firstClass - Math.max(0, opts.commuteMinutes) - ARRIVAL_BUFFER_MIN;
  const wake = leave - (opts.prepMinutes ?? DEFAULT_PREP_MIN);
  const bedtime = mod(wake - (opts.sleepHours ?? DEFAULT_SLEEP_HOURS) * 60);
  return { day, firstClass, leave: mod(leave), wake: mod(wake), bedtime, mood: moodOf(mod(wake)) };
}

export function weekWake(
  meetings: readonly TimeSpan[],
  opts: { commuteMinutes: number; prepMinutes?: number; sleepHours?: number },
): WakePlan[] {
  return ([1, 2, 3, 4, 5, 6] as Day[]).map((d) => wakeFor(meetings, d, opts)).filter((w): w is WakePlan => w !== null);
}
