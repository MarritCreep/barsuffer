import { describe, expect, it } from 'vitest';
import type { Day } from '../data/types';
import { courseMap } from '../data/catalog';
import { academicHours, totalCredits } from './load';
import { computeMisery, pickTitle, TITLES } from './misery';
import type { TimeSpan } from './schedule';
import { collectMeetings } from './schedule';
import type { Plan } from './selection';

function span(day: Day, start: string, end: string): TimeSpan {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return { day, start: toMin(start), end: toMin(end) };
}

/**
 * Контрольный пример: реальное расписание из образца
 * (все не-демо группы, которые студент выбрал в Инбаре).
 */
const CONTROL_PLAN: Plan = {
  v: 1,
  courses: [
    { courseId: '711081', color: 0, picks: { lecture: '18' } },
    { courseId: '711140', color: 1, picks: { lecture: '18' } },
    { courseId: '63254', color: 2, picks: { workshop: '18' } },
    { courseId: '63013', color: 3, picks: { lecture: '18' } },
    { courseId: '71204', color: 4, picks: { lecture: '18', exercise: '19' } },
    { courseId: '183138', color: 5, picks: { lecture: '01' } },
    { courseId: '63011', color: 6, picks: { lecture: '18' } },
    { courseId: '63938', color: 7, picks: { workshop: '18', other: '19' } },
    { courseId: '63256', color: 8, picks: { lecture: '18' } },
    { courseId: '161053', color: 9, picks: { lecture: '01' } },
    { courseId: '711082', color: 0, picks: { lecture: '18' } },
    { courseId: '711141', color: 1, picks: { lecture: '18' } },
    { courseId: '71052', color: 2, picks: { lecture: '18' } },
    { courseId: '63009', color: 3, picks: { lecture: '18' } },
    { courseId: '71205', color: 4, picks: { lecture: '19' } },
    { courseId: '63010', color: 5, picks: { lecture: '18' } },
    { courseId: '376030', color: 6, picks: { lecture: '01' } },
  ],
};

describe('control schedule', () => {
  it('semester A: 3 days, one 08:00 class, no windows → 30', () => {
    const meetings = collectMeetings(CONTROL_PLAN, courseMap, 'A');
    const r = computeMisery(meetings);
    expect(r).toMatchObject({ campusDays: 3, earlyClasses: 1, windowHours: 0, lateClasses: 0, hasFriday: false });
    expect(r.score).toBe(30);
    expect(academicHours(meetings)).toBe(18);
  });

  it('semester B: 3 days, early, 2-hour window, class until 20:00 → 41', () => {
    const meetings = collectMeetings(CONTROL_PLAN, courseMap, 'B');
    const r = computeMisery(meetings);
    expect(r).toMatchObject({ campusDays: 3, earlyClasses: 1, windowHours: 2, lateClasses: 1 });
    expect(r.score).toBe(41);
    expect(academicHours(meetings)).toBe(18);
  });

  it('credits: placeholder values sum to 36', () => {
    expect(totalCredits(CONTROL_PLAN, courseMap)).toEqual({ total: 36, unknown: 0 });
  });
});

describe('computeMisery rules', () => {
  it('empty schedule scores 0', () => {
    expect(computeMisery([]).score).toBe(0);
  });

  it('counts each campus day once', () => {
    const r = computeMisery([span(1, '10:00', '12:00'), span(1, '12:00', '14:00'), span(3, '10:00', '12:00')]);
    expect(r.campusDays).toBe(2);
    expect(r.points.days).toBe(16);
  });

  it('a gap shorter than one grid hour is not a window', () => {
    const r = computeMisery([span(2, '10:00', '12:00'), span(2, '12:45', '14:00')]);
    expect(r.windowHours).toBe(0);
  });

  it('counts whole hours of a window', () => {
    const r = computeMisery([span(2, '10:00', '12:00'), span(2, '13:30', '15:00')]);
    expect(r.windowHours).toBe(1);
    const r2 = computeMisery([span(2, '08:00', '10:00'), span(2, '13:00', '14:00')]);
    expect(r2.windowHours).toBe(3);
    expect(r2.points.windows).toBe(9);
  });

  it('gaps between different days are not windows', () => {
    const r = computeMisery([span(2, '08:00', '10:00'), span(3, '16:00', '18:00')]);
    expect(r.windowHours).toBe(0);
  });

  it('Friday adds 12 once, on top of the campus day', () => {
    const r = computeMisery([span(6, '10:00', '11:00'), span(6, '11:00', '12:00')]);
    expect(r.points.friday).toBe(12);
    expect(r.score).toBe(8 + 12);
  });

  it('early and late count per class; 08:59 is early, 09:00 is not; 19:00 end is not late', () => {
    const r = computeMisery([
      span(1, '08:00', '09:00'),
      span(2, '08:59', '10:00'),
      span(3, '09:00', '10:00'),
      span(4, '17:00', '19:00'),
      span(5, '18:00', '19:01'),
    ]);
    expect(r.earlyClasses).toBe(2);
    expect(r.lateClasses).toBe(1);
  });

  it('for overlapping classes only the heaviest one counts', () => {
    // 08:00–10:00 (раннее, 6) и 08:30–20:00 (раннее + позднее, 11) пересекаются.
    const r = computeMisery([span(2, '08:00', '10:00'), span(2, '08:30', '20:00')]);
    expect(r.earlyClasses).toBe(1);
    expect(r.lateClasses).toBe(1);
    expect(r.conflictClusters).toBe(1);
    expect(r.score).toBe(8 + 6 + 5);
  });

  it('windows use merged time when classes overlap', () => {
    // 10–12 и 11–13 сливаются в 10–13, окно до 15:00 — 2 часа.
    const r = computeMisery([span(2, '10:00', '12:00'), span(2, '11:00', '13:00'), span(2, '15:00', '16:00')]);
    expect(r.windowHours).toBe(2);
  });

  it('caps the score at 100', () => {
    const days: Day[] = [1, 2, 3, 4, 5, 6];
    const meetings = days.flatMap((d) => [span(d, '08:00', '09:00'), span(d, '15:00', '21:00')]);
    const r = computeMisery(meetings);
    expect(r.raw).toBeGreaterThan(100);
    expect(r.score).toBe(100);
  });
});

describe('pickTitle', () => {
  it('ghost for an empty week', () => {
    expect(pickTitle(computeMisery([]), 0)).toBe(TITLES.ghost);
  });

  it('quantum when classes overlap', () => {
    const m = [span(2, '10:00', '12:00'), span(2, '11:00', '13:00'), span(3, '10:00', '12:00'), span(4, '10:00', '12:00')];
    expect(pickTitle(computeMisery(m), m.length)).toBe(TITLES.quantum);
  });

  it('early bird when early classes dominate', () => {
    const m = [span(1, '08:00', '10:00'), span(2, '08:00', '10:00'), span(3, '08:00', '10:00')];
    expect(pickTitle(computeMisery(m), m.length)).toBe(TITLES.earlyBird);
  });

  it('library dweller for long windows', () => {
    const m = [span(1, '10:00', '11:00'), span(1, '15:00', '16:00'), span(2, '10:00', '11:00')];
    expect(pickTitle(computeMisery(m), m.length)).toBe(TITLES.library);
  });

  it('campus resident for five days', () => {
    const days: Day[] = [1, 2, 3, 4, 5];
    const m = days.map((d) => span(d, '10:00', '12:00'));
    expect(pickTitle(computeMisery(m), m.length)).toBe(TITLES.resident);
  });

  it('living the dream for an easy week', () => {
    const m = [span(2, '10:00', '12:00')];
    expect(pickTitle(computeMisery(m), m.length)).toBe(TITLES.dream);
  });
});
