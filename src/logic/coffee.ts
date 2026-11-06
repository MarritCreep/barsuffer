import { CAFE_POS } from '../data/campusMap';
import type { Day } from '../data/types';
import { metersOf, WALK, walkBetween, type XY } from './campus';
import type { PlacedMeeting } from './schedule';

/**
 * «Кофе в окне» — ЭКСПЕРИМЕНТ. Точки еды и кофе сняты на глаз со схемы кампуса
 * (значки «מסעדה / בית קפה»); положение — в метрах, как у зданий (`CAFE_POS`).
 */
export const CAFES: {
  id: string;
  /** Английская подпись; в интерфейсе — t('map.cafe', { b: near }). */
  label: string;
  /** Ближайшее здание (номер не переводится). */
  near: string;
  /** Метры (восток, север). */
  pos: XY;
}[] = Object.entries(CAFE_POS).map(([id, pos]) => {
  const near = id.replace('cafe-', '');
  return { id, label: `Café near ${near}`, near, pos };
});

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

    const a = metersOf(from.building);
    const b = metersOf(to.building) ?? a;
    let best: CoffeeGap['cafe'] = null;
    let there = 0;
    let back = 0;
    if (a && b) {
      let bestTotal = Infinity;
      for (const cafe of CAFES) {
        const c = cafe.pos;
        const t = minutes(walkBetween(a, c));
        const r = minutes(walkBetween(c, b));
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
