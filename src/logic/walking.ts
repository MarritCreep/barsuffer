import { DAYS, type Day } from '../data/types';
import { dayRoute, walkMeters } from './campus';
import type { PlacedMeeting } from './schedule';

/** Средняя длина шага, метры. */
export const STRIDE_M = 0.75;

/** Метры пешком за день: между парами и, если выбраны ворота, от ворот и обратно. */
export function dayWalkMeters(meetings: readonly PlacedMeeting[], day: Day, gate?: string): number {
  const { stops, legs } = dayRoute(meetings, day);
  let total = legs.reduce((sum, leg) => sum + (walkMeters(leg.from.building, leg.to.building) ?? 0), 0);
  if (gate && stops.length > 0) {
    total += walkMeters(gate, stops[0]!.building) ?? 0;
    total += walkMeters(stops[stops.length - 1]!.building, gate) ?? 0;
  }
  return total;
}

/** Метры пешком за неделю. */
export function weekWalkMeters(meetings: readonly PlacedMeeting[], gate?: string): number {
  return DAYS.reduce((sum, d) => sum + dayWalkMeters(meetings, d, gate), 0);
}

export function stepsFor(meters: number): number {
  return Math.round(meters / STRIDE_M);
}

/** Расстояние для показа: метры с точностью до 10 м или километры (1 знак до 10 км). */
export function distanceParts(meters: number): { value: number; digits: number; unit: 'm' | 'km' } {
  if (meters < 1000) return { value: Math.round(meters / 10) * 10, digits: 0, unit: 'm' };
  return { value: meters / 1000, digits: meters < 10_000 ? 1 : 0, unit: 'km' };
}

/** Английская строка расстояния; интерфейс переводит через distanceParts. */
export function formatDistance(meters: number): string {
  const p = distanceParts(meters);
  return p.unit === 'm' ? `${p.value} m` : `${p.value.toFixed(p.digits)} km`;
}

export type FunDistanceId =
  | 'football'
  | 'eiffel'
  | 'bennu'
  | 'burj'
  | 'comet67p'
  | 'atlas'
  | 'everest'
  | 'mariana'
  | 'deimos'
  | 'halley'
  | 'halfMarathon'
  | 'phobos'
  | 'marathon'
  | 'karman';

/**
 * Забавные мерки длины, по возрастанию. Цифры — общеизвестные оценки:
 * 3I/ATLAS — верхняя оценка ядра по Hubble (июль 2025), 67P — по Rosetta.
 * `label` — английский текст; интерфейс переводит по `fun.<id>`.
 */
export const FUN_DISTANCES: { id: FunDistanceId; meters: number; label: string }[] = [
  { id: 'football', meters: 105, label: 'a football pitch' },
  { id: 'eiffel', meters: 330, label: 'the Eiffel Tower, lying down' },
  { id: 'bennu', meters: 490, label: 'asteroid Bennu (≈490 m across)' },
  { id: 'burj', meters: 828, label: 'the Burj Khalifa, lying down' },
  { id: 'comet67p', meters: 4_100, label: 'comet 67P/Churyumov–Gerasimenko (≈4.1 km long)' },
  { id: 'atlas', meters: 5_600, label: 'the nucleus of interstellar comet 3I/ATLAS (≤5.6 km across)' },
  { id: 'everest', meters: 8_849, label: 'Mount Everest, but sideways' },
  { id: 'mariana', meters: 10_935, label: 'the Mariana Trench, straight down' },
  { id: 'deimos', meters: 12_400, label: 'Mars’s moon Deimos (≈12.4 km across)' },
  { id: 'halley', meters: 15_000, label: 'the nucleus of Halley’s Comet (≈15 km long)' },
  { id: 'halfMarathon', meters: 21_097, label: 'a half marathon' },
  { id: 'phobos', meters: 22_500, label: 'Mars’s moon Phobos (≈22.5 km across)' },
  { id: 'marathon', meters: 42_195, label: 'a full marathon' },
  { id: 'karman', meters: 100_000, label: 'the Kármán line — the edge of space' },
];

/** Сравнение с меркой без текста — его собирает интерфейс на нужном языке. */
export type FunComparison =
  | { kind: 'none' }
  | { kind: 'percent'; id: FunDistanceId; label: string; percent: number }
  | { kind: 'about'; id: FunDistanceId; label: string }
  | { kind: 'times'; id: FunDistanceId; label: string; ratio: number };

/** Самая большая мерка, которую расстояние уже превзошло (или доля от самой маленькой). */
export function funComparison(meters: number): FunComparison {
  if (meters <= 0) return { kind: 'none' };
  const first = FUN_DISTANCES[0]!;
  if (meters < first.meters) {
    return { kind: 'percent', id: first.id, label: first.label, percent: Math.round((meters / first.meters) * 100) };
  }
  const ref = [...FUN_DISTANCES].reverse().find((r) => r.meters <= meters)!;
  const ratio = meters / ref.meters;
  return ratio < 1.15
    ? { kind: 'about', id: ref.id, label: ref.label }
    : { kind: 'times', id: ref.id, label: ref.label, ratio };
}

/** «≈ 1.3× Mount Everest, but sideways» — английская строка (для тестов и не-React кода). */
export function funDistance(meters: number): string {
  const c = funComparison(meters);
  switch (c.kind) {
    case 'none':
      return 'not a single step between classes';
    case 'percent':
      return `${c.percent}% of ${c.label}`;
    case 'about':
      return `about ${c.label}`;
    case 'times':
      return `${c.ratio.toFixed(1)}× ${c.label}`;
  }
}
