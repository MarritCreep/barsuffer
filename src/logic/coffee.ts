import type { Day } from '../data/types';
import { pointOf, WALK, walkMetersXY } from './campus';
import type { PlacedMeeting } from './schedule';

/**
 * «Кофе в окне» — ЭКСПЕРИМЕНТ. Точки еды и кофе сняты на глаз со схемы кампуса
 * (значки «מסעדה / בית קפה»), в тех же координатах, что и здания.
 */
export const CAFES: { id: string; label: string; xy: [number, number] }[] = [
  { id: 'cafe-905', label: 'Café near 905', xy: [483, 103] },
  { id: 'cafe-604', label: 'Café near 604', xy: [480, 494] },
  { id: 'cafe-409', label: 'Café near 409', xy: [437, 627] },
  { id: 'cafe-404', label: 'Café near 404', xy: [531, 659] },
  { id: 'cafe-306', label: 'Café near 306', xy: [662, 706] },
  { id: 'cafe-402', label: 'Café near 402', xy: [513, 728] },
  { id: 'cafe-212', label: 'Café near 212', xy: [437, 800] },
  { id: 'cafe-107', label: 'Café near 107', xy: [641, 1012] },
];

/** Окно короче этого — не повод идти за кофе. */
export const MIN_COFFEE_GAP = 60;

export interface CoffeeGap {
  day: Day;
  from: PlacedMeeting;
  to: PlacedMeeting;
  /** Минуты между концом одной пары и началом следующей. */
  minutes: number;
  cafe: (typeof CAFES)[number] | null;
  walkThere: number;
  walkBack: number;
  /** Сколько останется на сам кофе. */
  coffeeMinutes: number;
}

const minutes = (meters: number) => Math.max(1, Math.round(meters / WALK.metersPerMinute));

/** Окна от часа между соседними парами одного дня и ближайшее к маршруту кафе. */
export function coffeeGaps(meetings: readonly PlacedMeeting[]): CoffeeGap[] {
  const classes = meetings.filter((m) => !m.isBlock).sort((a, b) => a.day - b.day || a.start - b.start);
  const gaps: CoffeeGap[] = [];
  for (let i = 1; i < classes.length; i++) {
    const from = classes[i - 1]!;
    const to = classes[i]!;
    if (from.day !== to.day) continue;
    const gap = to.start - from.end;
    if (gap < MIN_COFFEE_GAP) continue;

    const a = pointOf(from.building);
    const b = pointOf(to.building) ?? a;
    let best: CoffeeGap['cafe'] = null;
    let there = 0;
    let back = 0;
    if (a && b) {
      let bestTotal = Infinity;
      for (const cafe of CAFES) {
        const t = minutes(walkMetersXY(a, cafe.xy));
        const r = minutes(walkMetersXY(cafe.xy, b));
        if (t + r < bestTotal) {
          bestTotal = t + r;
          best = cafe;
          there = t;
          back = r;
        }
      }
    }
    gaps.push({
      day: from.day,
      from,
      to,
      minutes: gap,
      cafe: best,
      walkThere: there,
      walkBack: back,
      coffeeMinutes: gap - there - back,
    });
  }
  return gaps;
}
