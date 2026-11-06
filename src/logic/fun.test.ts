import { describe, expect, it } from 'vitest';
import { courseMap } from '../data/catalog';
import { dayJourney } from './campus';
import { CAFES, coffeeGaps } from './coffee';
import { dayMisery, hellDay } from './misery';
import type { PlacedMeeting } from './schedule';
import type { Plan } from './selection';
import { remainingSessions, semesterProgress, weekdayCount } from './today';
import {
  dayWalkMeters,
  distanceParts,
  formatDistance,
  FUN_DISTANCES,
  funComparison,
  funDistance,
  stepsFor,
  weekWalkMeters,
} from './walking';
import { rainAt, rainWarnings, type HourlyForecast } from './weather';
import { computeWrapped } from './wrapped';

function m(day: 1 | 2 | 3 | 4 | 5 | 6, start: string, end: string, building?: string, id = 'x'): PlacedMeeting {
  const t = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return {
    key: `${id}-${day}-${start}`,
    courseId: id,
    courseName: id,
    sectionNumber: '01',
    type: 'lecture',
    day,
    start: t(start),
    end: t(end),
    building,
    color: 0,
    isDemo: false,
  };
}

describe('calendar math', () => {
  it('counts weekdays in a date range', () => {
    // Семестр A: вс 11.10.2026 – вс 17.1.2027.
    const start = new Date(2026, 9, 11);
    const end = new Date(2027, 0, 17);
    expect(weekdayCount(start, end, 1)).toBe(15); // воскресенья
    expect(weekdayCount(start, end, 3)).toBe(14); // вторники
    expect(weekdayCount(end, start, 3)).toBe(0);
  });

  it('semester progress: before, during, after', () => {
    expect(semesterProgress(new Date(2026, 9, 1), 'A')).toMatchObject({ phase: 'before', daysUntilStart: 10 });
    const mid = semesterProgress(new Date(2026, 10, 10), 'A')!;
    expect(mid).toMatchObject({ phase: 'during', week: 5, totalWeeks: 15 });
    expect(mid.fraction).toBeGreaterThan(0.3);
    expect(mid.fraction).toBeLessThan(0.33);
    expect(semesterProgress(new Date(2027, 1, 1), 'A')).toMatchObject({ phase: 'after', fraction: 1 });
  });

  it('counts the classes still ahead', () => {
    const tue = [m(3, '08:00', '10:00')];
    // Вторник 12.1.2027, 07:00: сегодняшняя пара ещё впереди, а других вторников до 17.1 нет.
    expect(remainingSessions(new Date(2027, 0, 12, 7, 0), 'A', tue)).toBe(1);
    expect(remainingSessions(new Date(2027, 0, 12, 11, 0), 'A', tue)).toBe(0);
    expect(remainingSessions(new Date(2026, 9, 1), 'A', tue)).toBe(14);
  });
});

describe('suffering heat map', () => {
  it('scores each day on its own and finds the hell day', () => {
    const meetings = [m(2, '10:00', '12:00'), m(3, '08:00', '10:00'), m(3, '13:00', '19:00')];
    const days = dayMisery(meetings);
    expect(days.get(2)).toBe(8);
    expect(days.get(3)).toBe(8 + 6 + 3 * 3 + 5); // день, раннее, 3 часа окна, позднее
    expect(hellDay(meetings)).toEqual({ day: 3, score: 28 });
    expect(hellDay([])).toBeNull();
  });
});

describe('walking', () => {
  it('sums walks between classes, optionally from a gate', () => {
    const day = [m(4, '14:00', '16:00', '105', 'a'), m(4, '16:00', '18:00', '901', 'b')];
    const between = dayWalkMeters(day, 4);
    expect(between).toBeGreaterThan(1000);
    expect(dayWalkMeters(day, 4, 'gate-40')).toBeGreaterThan(between);
    expect(weekWalkMeters(day)).toBe(between);
    expect(stepsFor(750)).toBe(1000);
  });

  it('formats distances', () => {
    expect(formatDistance(430)).toBe('430 m');
    expect(formatDistance(4230)).toBe('4.2 km');
    expect(formatDistance(23_400)).toBe('23 km');
  });

  it('finds a fun comparison', () => {
    expect(funDistance(0)).toBe('not a single step between classes');
    expect(funDistance(50)).toBe('48% of a football pitch');
    expect(funDistance(5_700)).toBe('about the nucleus of interstellar comet 3I/ATLAS (≤5.6 km across)');
    expect(funDistance(8_000)).toBe('1.4× the nucleus of interstellar comet 3I/ATLAS (≤5.6 km across)');
    expect(funDistance(150_000)).toBe('1.5× the Kármán line — the edge of space');
  });

  it('gives the comparison as data for translation', () => {
    expect(funComparison(0)).toEqual({ kind: 'none' });
    expect(funComparison(50)).toMatchObject({ kind: 'percent', id: 'football', percent: 48 });
    expect(funComparison(5_700)).toMatchObject({ kind: 'about', id: 'atlas' });
    expect(funComparison(150_000)).toMatchObject({ kind: 'times', id: 'karman', ratio: 1.5 });
    expect(new Set(FUN_DISTANCES.map((d) => d.id)).size).toBe(FUN_DISTANCES.length);
    expect(distanceParts(4230)).toEqual({ value: 4.23, digits: 1, unit: 'km' });
    expect(distanceParts(434)).toEqual({ value: 430, digits: 0, unit: 'm' });
  });
});

describe('coffee in the gap', () => {
  it('finds the nearest café for a gap of an hour or more', () => {
    const gaps = coffeeGaps([m(3, '08:00', '10:00', '105', 'a'), m(3, '12:00', '14:00', '604', 'b')]);
    expect(gaps).toHaveLength(1);
    const g = gaps[0]!;
    expect(g.minutes).toBe(120);
    expect(CAFES.map((c) => c.id)).toContain(g.cafe!.id);
    expect(g.coffeeMinutes).toBe(120 - g.walkThere - g.walkBack);
    // Кафе возле 404 лежит прямо по пути 105 → 604, поэтому крюк минимальный.
    expect(g.cafe!.id).toBe('cafe-404');
    expect(g.walkThere + g.walkBack).toBeLessThanOrEqual(14);
  });

  it('ignores short breaks and other days', () => {
    expect(coffeeGaps([m(3, '08:00', '10:00', '105'), m(3, '10:30', '12:00', '105')])).toEqual([]);
    expect(coffeeGaps([m(3, '08:00', '10:00', '105'), m(4, '12:00', '14:00', '105')])).toEqual([]);
  });

  it('a gap without map data still shows up', () => {
    const [g] = coffeeGaps([m(3, '08:00', '10:00', undefined), m(3, '12:00', '14:00', undefined)]);
    expect(g).toMatchObject({ cafe: null, coffeeMinutes: 120 });
  });
});

describe('rain warning', () => {
  const forecast: HourlyForecast = {
    time: ['2026-11-11T13:00', '2026-11-11T14:00', '2026-11-11T15:00', '2026-11-11T16:00', '2026-11-11T17:00', '2026-11-11T18:00'],
    precipitation_probability: [10, 20, 30, 80, 40, 10],
    precipitation: [0, 0, 0, 1.2, 0.1, 0],
  };
  const day = [m(4, '14:00', '16:00', '105', 'a'), m(4, '16:00', '18:00', '901', 'b')];

  it('reads the forecast for an hour', () => {
    expect(rainAt(forecast, '2026-11-11', 16 * 60 + 5)).toEqual({ prob: 80, mm: 1.2 });
    expect(rainAt(forecast, '2026-11-12', 16 * 60)).toBeNull();
  });

  it('warns about a long walk in the rain', () => {
    const warnings = rainWarnings(forecast, '2026-11-11', dayJourney(day, 4));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ at: 16 * 60, prob: 80, from: '105', to: '901' });
  });

  it('stays quiet when it is dry', () => {
    const dry = { ...forecast, precipitation_probability: forecast.time.map(() => 5), precipitation: forecast.time.map(() => 0) };
    expect(rainWarnings(dry, '2026-11-11', dayJourney(day, 4))).toEqual([]);
  });

  it('includes the walk from the gate and back', () => {
    const wet = { ...forecast, precipitation_probability: forecast.time.map(() => 90) };
    const warnings = rainWarnings(wet, '2026-11-11', dayJourney(day, 4, 'gate-40'), 'gate-40');
    expect(warnings.map((w) => `${w.from} → ${w.to}`)).toEqual([
      'gate-40 → 105',
      '105 → 901',
      '901 → gate-40',
    ]);
  });
});

describe('Wrapped', () => {
  const plan: Plan = {
    v: 1,
    courses: [
      { courseId: '63013', color: 0, picks: { lecture: '18' } }, // A: вт 08–10
      { courseId: '63009', color: 1, picks: { lecture: '18' } }, // B: вт 08–10
    ],
  };

  it('semester A: weekly schedule × real number of Tuesdays', () => {
    const w = computeWrapped(plan, courseMap, 'A', { commuteMinutes: 45 }, new Date(2026, 9, 1));
    expect(w).toMatchObject({
      phase: 'before',
      weeks: 15,
      classHours: 28,
      sessions: 14,
      campusDays: 14,
      earlyWakeups: 14,
      lateEvenings: 0,
      fridays: 0,
      gapHours: 0,
      walkMeters: 0,
      commuteHours: 21,
      score: 14,
      courses: 1,
      empty: false,
    });
    expect(w.hellDay).toEqual({ day: 3, score: 14, semester: 'A' });
  });

  it('whole year adds both semesters', () => {
    const w = computeWrapped(plan, courseMap, 'year', { commuteMinutes: 0 }, new Date(2026, 10, 10));
    expect(w.sessions).toBe(14 + 17); // во втором семестре 17 вторников
    expect(w.phase).toBe('during');
    expect(w.courses).toBe(2);
  });

  it('after the semester it is a recap', () => {
    expect(computeWrapped(plan, courseMap, 'A', { commuteMinutes: 0 }, new Date(2027, 1, 1)).phase).toBe('after');
  });

  it('an empty plan is flagged', () => {
    expect(computeWrapped({ v: 1, courses: [] }, courseMap, 'B', { commuteMinutes: 0 }, new Date()).empty).toBe(true);
  });
});
