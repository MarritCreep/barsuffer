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

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/**
 * Забавные мерки длины, по возрастанию. Цифры — общеизвестные оценки:
 * 3I/ATLAS — верхняя оценка ядра по Hubble (июль 2025), 67P — по Rosetta.
 */
export const FUN_DISTANCES: { meters: number; label: string }[] = [
  { meters: 105, label: 'a football pitch' },
  { meters: 330, label: 'the Eiffel Tower, lying down' },
  { meters: 490, label: 'asteroid Bennu (≈490 m across)' },
  { meters: 828, label: 'the Burj Khalifa, lying down' },
  { meters: 4_100, label: 'comet 67P/Churyumov–Gerasimenko (≈4.1 km long)' },
  { meters: 5_600, label: 'the nucleus of interstellar comet 3I/ATLAS (≤5.6 km across)' },
  { meters: 8_849, label: 'Mount Everest, but sideways' },
  { meters: 10_935, label: 'the Mariana Trench, straight down' },
  { meters: 12_400, label: 'Mars’s moon Deimos (≈12.4 km across)' },
  { meters: 15_000, label: 'the nucleus of Halley’s Comet (≈15 km long)' },
  { meters: 21_097, label: 'a half marathon' },
  { meters: 22_500, label: 'Mars’s moon Phobos (≈22.5 km across)' },
  { meters: 42_195, label: 'a full marathon' },
  { meters: 100_000, label: 'the Kármán line — the edge of space' },
];

/** «≈ 1.3× Mount Everest, but sideways» — самая большая мерка, которую расстояние уже превзошло. */
export function funDistance(meters: number): string {
  if (meters <= 0) return 'not a single step between classes';
  const first = FUN_DISTANCES[0]!;
  if (meters < first.meters) return `${Math.round((meters / first.meters) * 100)}% of ${first.label}`;
  const ref = [...FUN_DISTANCES].reverse().find((r) => r.meters <= meters)!;
  const ratio = meters / ref.meters;
  return ratio < 1.15 ? `about ${ref.label}` : `${ratio.toFixed(1)}× ${ref.label}`;
}
