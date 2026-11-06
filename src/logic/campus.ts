import type { Day } from '../data/types';
import type { PlacedMeeting } from './schedule';

/**
 * «Беги!» — ЭКСПЕРИМЕНТ. Примерное время пешком между зданиями кампуса.
 *
 * Координаты — центры номеров зданий на схеме кампуса (картинка 1224×1112 px),
 * снятые на глаз. Схема стилизованная, поэтому всё приблизительно.
 */
export const BUILDING_XY: Record<string, [number, number]> = {
  '101': [380, 1097], '102': [483, 1053], '103': [359, 1033], '104': [428, 1027],
  '105': [540, 1005], '106': [580, 1007], '107': [634, 982], '108': [669, 938],
  '109': [518, 971], '110': [586, 951],
  '201': [457, 988], '202': [480, 940], '203': [525, 918], '204': [428, 973],
  '205': [411, 954], '206': [443, 887], '207': [508, 891], '208': [399, 931],
  '209': [397, 895], '210': [518, 862], '211': [480, 851], '212': [456, 815],
  '213': [451, 779], '214': [362, 862], '215': [398, 839], '216': [410, 727],
  '217': [397, 666],
  '300': [695, 857], '301': [668, 873], '302': [746, 848], '303': [733, 814],
  '304': [613, 850], '305': [709, 775], '306': [681, 719], '307': [585, 807],
  '401': [528, 788], '402': [553, 733], '403': [529, 698], '404': [503, 659],
  '405': [579, 664], '407': [670, 605], '408': [452, 659], '409': [463, 628],
  '410': [531, 598], '411': [600, 578],
  '501': [400, 585], '502': [428, 470], '503': [499, 524], '504': [562, 503],
  '505': [543, 434], '506': [553, 369], '507': [503, 363], '508': [407, 369],
  '509': [393, 336], '510': [411, 309],
  '604': [487, 474], '605': [451, 481], '606': [400, 469],
  '801': [460, 347], '802': [465, 256],
  '901': [533, 113], '902': [566, 81], '905': [484, 83], '906': [536, 52],
  '1401': [720, 228], '1501': [692, 10], '1502': [534, 274],
};

/** Масштаб и скорость — грубые допущения, их стоит проверить ногами. */
export const WALK = {
  /** метров на пиксель схемы (весь кампус с юга на север ≈ 1,3 км) */
  metersPerPx: 1.2,
  /** дорожки не прямые */
  routeFactor: 1.35,
  /** спокойный шаг */
  metersPerMinute: 70,
};

/**
 * Перерыв, который реально есть между «стыкующимися» парами: пара 10:00–12:00
 * длится около полутора часов чистого времени, поэтому считаем ~15 минут на переход.
 */
export const BREAK_BUFFER_MIN = 15;

/** Ворота кампуса (שער) — откуда день начинается и где заканчивается. Те же координаты схемы. */
export const GATES: Record<string, [number, number]> = {
  'gate-1': [701, 668],
  'gate-2': [681, 652],
  'gate-5': [549, 232],
  'gate-10': [784, 118],
  'gate-25': [406, 252],
  'gate-30': [343, 950],
  'gate-40': [748, 925],
};

export function isGate(id: string): boolean {
  return id in GATES;
}

export function gateLabel(id: string): string {
  return `Gate ${id.replace('gate-', '')}`;
}

/** Координаты здания или ворот на схеме. */
export function pointOf(id?: string): [number, number] | undefined {
  if (!id) return undefined;
  return BUILDING_XY[id] ?? GATES[id];
}

/** Примерное расстояние пешком в метрах между точками схемы. */
export function walkMetersXY(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) * WALK.metersPerPx * WALK.routeFactor;
}

/** Примерные метры пешком между зданиями или воротами; null — точка неизвестна схеме. */
export function walkMeters(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  if (from === to) return 0;
  const a = pointOf(from);
  const b = pointOf(to);
  if (!a || !b) return null;
  return walkMetersXY(a, b);
}

/** Примерные минуты пешком между зданиями или воротами; null — точка неизвестна схеме. */
export function walkMinutes(from?: string, to?: string): number | null {
  const m = walkMeters(from, to);
  return m === null ? null : Math.round(m / WALK.metersPerMinute);
}

export interface Sprint {
  day: Day;
  from: PlacedMeeting;
  to: PlacedMeeting;
  /** Минуты пешком. */
  walk: number;
  /** Минуты на переход: промежуток в расписании + BREAK_BUFFER_MIN. */
  available: number;
}

export interface RouteLeg {
  from: PlacedMeeting;
  to: PlacedMeeting;
  /** null — одно из зданий неизвестно схеме. */
  walk: number | null;
  /** Минуты на переход (промежуток + BREAK_BUFFER_MIN); отрицательно при накладке. */
  available: number;
  run: boolean;
}

export interface DayJourney {
  stops: PlacedMeeting[];
  legs: RouteLeg[];
  /** Ворота → первая пара (если ворота выбраны и здание известно). */
  arrive: number | null;
  /** Последняя пара → ворота. */
  leave: number | null;
  /** Сумма известных минут пешком за день, включая путь от ворот и обратно. */
  totalWalk: number;
}

/** Весь день от входа до выхода: ворота → пара 1 → пара 2 → … → ворота. */
export function dayJourney(meetings: readonly PlacedMeeting[], day: Day, gate?: string): DayJourney {
  const { stops, legs } = dayRoute(meetings, day);
  const first = stops[0];
  const last = stops[stops.length - 1];
  const arrive = gate && first ? walkMinutes(gate, first.building) : null;
  const leave = gate && last ? walkMinutes(last.building, gate) : null;
  const totalWalk = [arrive, leave, ...legs.map((l) => l.walk)].reduce<number>((sum, w) => sum + (w ?? 0), 0);
  return { stops, legs, arrive, leave, totalWalk };
}

/** Маршрут дня: занятия по порядку и переходы между соседними. Блокировки не входят. */
export function dayRoute(meetings: readonly PlacedMeeting[], day: Day): { stops: PlacedMeeting[]; legs: RouteLeg[] } {
  const stops = meetings
    .filter((m) => m.day === day && !m.isBlock)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const legs: RouteLeg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1]!;
    const to = stops[i]!;
    const walk = walkMinutes(from.building, to.building);
    const available = to.start - from.end + BREAK_BUFFER_MIN;
    legs.push({ from, to, walk, available, run: walk !== null && to.start >= from.end && walk > available });
  }
  return { stops, legs };
}

/** Переходы между соседними занятиями, на которые не хватает времени. */
export function findSprints(meetings: readonly PlacedMeeting[]): Sprint[] {
  const classes = meetings.filter((m) => !m.isBlock && m.building);
  const sprints: Sprint[] = [];
  for (const from of classes) {
    // Ближайшее занятие того же дня, которое начинается после конца этого.
    const to = classes
      .filter((m) => m.day === from.day && m.start >= from.end && m.key !== from.key)
      .sort((a, b) => a.start - b.start)[0];
    if (!to) continue;
    const walk = walkMinutes(from.building, to.building);
    if (walk === null) continue;
    const available = to.start - from.end + BREAK_BUFFER_MIN;
    if (walk > available) sprints.push({ day: from.day, from, to, walk, available });
  }
  return sprints.sort((a, b) => a.day - b.day || a.to.start - b.to.start);
}
