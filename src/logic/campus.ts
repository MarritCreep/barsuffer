import { BUILDING_POS, BUILDING_SHAPES, CAMPUS_BOUNDARY, GATE_POS, VIEW_ROTATION_DEG, type XY } from '../data/campusMap';
import type { Day } from '../data/types';
import type { PlacedMeeting } from './schedule';

/**
 * «Беги!» — ЭКСПЕРИМЕНТ. Примерное время пешком между зданиями кампуса.
 *
 * Все места — в метрах (восток, север) из `src/data/campusMap.ts`: граница кампуса и контуры зданий из
 * OpenStreetMap, номера зданий без номера в OSM сопоставлены по официальной схеме кампуса.
 * Для показа карта повёрнута как официальная схема (`viewOf`), единица экрана — метр.
 */
export type { XY };

/** Допущения о ходьбе — их стоит проверить ногами. */
export const WALK = {
  /** дорожки не прямые: путь длиннее прямой линии */
  routeFactor: 1.3,
  /** спокойный шаг */
  metersPerMinute: 70,
};

// ---------- Метры и вид ----------

/** Положение здания или ворот в метрах (восток, север). */
export function metersOf(id?: string): XY | undefined {
  if (!id) return undefined;
  return BUILDING_POS[id] ?? GATE_POS[id];
}

/** Метры пешком между двумя точками на местности (с поправкой на непрямые дорожки). */
export function walkBetween(a: XY, b: XY): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) * WALK.routeFactor;
}

const ROT = (VIEW_ROTATION_DEG * Math.PI) / 180;

/**
 * Метры → координаты экрана (тоже метры, y вниз), повёрнутые как официальная схема кампуса:
 * «вверх» на экране — направление, отклонённое от севера на VIEW_ROTATION_DEG по часовой.
 */
export function viewOf([e, n]: XY): XY {
  const up = e * Math.sin(ROT) + n * Math.cos(ROT);
  const right = e * Math.cos(ROT) - n * Math.sin(ROT);
  return [right, -up];
}

/** Граница кампуса на экране. */
export const CAMPUS_OUTLINE: XY[] = CAMPUS_BOUNDARY.map(viewOf);

/** Контуры зданий на экране. */
export const BUILDING_OUTLINES: { id?: string; poly: XY[] }[] = BUILDING_SHAPES.map((b) => ({
  ...(b.id ? { id: b.id } : {}),
  poly: b.poly.map(viewOf),
}));

/** Центры зданий на экране, по номеру. */
export const BUILDING_VIEW: Record<string, XY> = Object.fromEntries(
  Object.entries(BUILDING_POS).map(([id, p]) => [id, viewOf(p)]),
);

/**
 * Перерыв, который реально есть между «стыкующимися» парами: пара 10:00–12:00
 * длится около полутора часов чистого времени, поэтому считаем ~15 минут на переход.
 */
export const BREAK_BUFFER_MIN = 15;

/** Номер ворот: 'gate-40' → '40'. Подпись («Gate 40», «Ворота 40», «שער 40») делает интерфейс. */
export function gateNumber(id: string): string {
  return id.replace('gate-', '');
}

/** Ворота кампуса (שער) на экране — откуда день начинается и где заканчивается. */
export const GATES: Record<string, XY> = Object.fromEntries(
  Object.entries(GATE_POS)
    .sort(([a], [b]) => Number(gateNumber(a)) - Number(gateNumber(b)))
    .map(([id, p]) => [id, viewOf(p)]),
);

export function isGate(id: string): boolean {
  return id in GATE_POS;
}

/** Английская подпись ворот (для старого кода и тестов); в интерфейсе — t('map.gate'). */
export function gateLabel(id: string): string {
  return `Gate ${gateNumber(id)}`;
}

/** Координаты здания или ворот на экране карты. */
export function pointOf(id?: string): XY | undefined {
  if (!id) return undefined;
  return BUILDING_VIEW[id] ?? GATES[id];
}

/** Примерные метры пешком между зданиями или воротами; null — точка неизвестна схеме. */
export function walkMeters(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  if (from === to) return 0;
  const a = metersOf(from);
  const b = metersOf(to);
  if (!a || !b) return null;
  return walkBetween(a, b);
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
