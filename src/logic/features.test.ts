import { describe, expect, it } from 'vitest';
import type { Course } from '../data/types';
import { courseMap } from '../data/catalog';
import { autoPick } from './autopick';
import { blockMeetings, isBlockId } from './blocks';
import {
  BREAK_BUFFER_MIN,
  BUILDING_OUTLINES,
  CAMPUS_OUTLINE,
  dayJourney,
  dayRoute,
  findSprints,
  isGate,
  metersOf,
  walkMeters,
  walkMinutes,
} from './campus';
import { weeklyCommuteHours } from './load';
import { computeMisery, MISERY_WEIGHTS } from './misery';
import { miseryDelta } from './preview';
import { collectMeetings, findConflicts, type PlacedMeeting } from './schedule';
import type { Plan } from './selection';
import { optionsForSlot, hourSlot } from './slots';
import { catalog } from '../data/catalog';
import { dayOf, nextClassAfterToday, semesterOn, todayInfo } from './today';

const course = (id: string) => courseMap.get(id) as Course;

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

describe('custom misery weights', () => {
  it('uses given weights instead of the standard ones', () => {
    const meetings = [m(6, '08:00', '10:00')];
    expect(computeMisery(meetings).raw).toBe(8 + 6 + 12);
    const relaxed = { ...MISERY_WEIGHTS, friday: 0, earlyClass: 0 };
    expect(computeMisery(meetings, relaxed).raw).toBe(8);
  });

  it('auto-pick follows custom weights', () => {
    // 63013: вт 08–10 (раннее) или вс 12–14. Со стандартными весами лучше воскресенье,
    // а если ранние занятия бесплатны — оба варианта стоят одинаково.
    const base = autoPick({
      courses: [course('63013')],
      required: new Set(['63013']),
      optionalToTake: 0,
      semester: 'A',
    });
    expect(base.results[0]!.picks['63013']).toEqual({ lecture: '19' }); // вс 12–14 без раннего
    const noEarly = autoPick({
      courses: [course('63013')],
      required: new Set(['63013']),
      optionalToTake: 0,
      semester: 'A',
      weights: { ...MISERY_WEIGHTS, earlyClass: 0 },
    });
    // Оба варианта теперь по 8 баллов — порядок стабилен, но стоимость равна.
    expect(noEarly.results.map((r) => r.cost)).toEqual([8, 8]);
  });
});

describe('personal blocks', () => {
  const plan: Plan = {
    v: 1,
    courses: [{ courseId: '63256', color: 0, picks: { lecture: '18' } }], // ср 14–16
    blocks: [
      { id: 'b1', label: 'Work', day: 4, startTime: '15:00', endTime: '19:00' },
      { id: 'b2', label: 'Gym', day: 2, startTime: '08:00', endTime: '09:00', semester: 'B' },
    ],
  };

  it('turns blocks into grid items for the right semester', () => {
    expect(blockMeetings(plan, 'A').map((b) => b.courseName)).toEqual(['Work']);
    expect(blockMeetings(plan, 'B').map((b) => b.courseName)).toEqual(['Work', 'Gym']);
    expect(isBlockId(blockMeetings(plan, 'A')[0]!.courseId)).toBe(true);
  });

  it('a class overlapping a block is a conflict', () => {
    const all = [...collectMeetings(plan, courseMap, 'A'), ...blockMeetings(plan, 'A')];
    expect(findConflicts(all)).toHaveLength(1);
  });

  it('blocks do not change the misery index', () => {
    expect(computeMisery(collectMeetings(plan, courseMap, 'A')).raw).toBe(8);
  });

  it('what-fits flags options that overlap a block', () => {
    const empty: Plan = { v: 1, courses: [], blocks: plan.blocks };
    const current = blockMeetings(empty, 'A');
    const options = optionsForSlot(catalog.courses, empty, 'A', hourSlot(4, 14 * 60), current);
    expect(options.find((o) => o.course.courseId === '63256')!.conflicts).toBe(1);
  });

  it('auto-pick avoids blocked time', () => {
    // 63011: вт 14–16 или ср 14–16; блок в среду 15–19 → выбрать вторник.
    const { results } = autoPick({
      courses: [course('63011')],
      required: new Set(['63011']),
      optionalToTake: 0,
      semester: 'A',
      blocked: blockMeetings(plan, 'A'),
    });
    expect(results[0]!.picks['63011']).toEqual({ lecture: '18' });
    expect(results[0]!.conflicts).toBe(0);
  });
});

describe('ghost preview delta', () => {
  it('shows how the index changes when a group is picked', () => {
    const plan: Plan = { v: 1, courses: [{ courseId: '63013', color: 0, picks: { lecture: '18' } }] };
    // вт 08–10 (8 + 6) → вс 12–14 (8): −6.
    expect(miseryDelta(plan, courseMap, 'A', course('63013'), '19')).toBe(-6);
  });

  it('adding a group on a new day costs a campus day', () => {
    const plan: Plan = { v: 1, courses: [{ courseId: '711140', color: 0, picks: {} }] };
    expect(miseryDelta(plan, courseMap, 'A', course('711140'), '18')).toBe(8);
  });
});

describe('commute', () => {
  it('counts both ways for each campus day', () => {
    expect(weeklyCommuteHours(3, 45)).toBe(4.5);
    expect(weeklyCommuteHours(0, 60)).toBe(0);
  });
});

describe('today', () => {
  const plan: Plan = {
    v: 1,
    courses: [
      { courseId: '63013', color: 0, picks: { lecture: '18' } }, // вт 08–10
      { courseId: '183138', color: 1, picks: { lecture: '01' } }, // вт 12–14
      { courseId: '63254', color: 2, picks: { workshop: '18' } }, // пн 16–18
    ],
  };
  const meetingsFor = (s: 'A' | 'B') => collectMeetings(plan, courseMap, s);

  it('knows the semester and weekday from the date', () => {
    expect(semesterOn(new Date(2026, 10, 10))).toBe('A'); // 10.11.2026
    expect(semesterOn(new Date(2027, 1, 10))).toBeNull(); // экзамены/каникулы
    expect(semesterOn(new Date(2027, 2, 1))).toBe('B');
    expect(dayOf(new Date(2026, 10, 8))).toBe(1); // воскресенье
    expect(dayOf(new Date(2026, 10, 14))).toBeNull(); // суббота
  });

  it('marks done, now and next classes', () => {
    const info = todayInfo(new Date(2026, 10, 10, 12, 30), meetingsFor); // вторник 12:30
    expect(info.kind).toBe('day');
    if (info.kind !== 'day') return;
    expect(info.items.map((i) => [i.meeting.courseId, i.status])).toEqual([
      ['63013', 'done'],
      ['183138', 'now'],
    ]);
  });

  it('a day without classes has no items', () => {
    const info = todayInfo(new Date(2026, 10, 12, 9, 0), meetingsFor); // четверг
    expect(info).toMatchObject({ kind: 'day', items: [] });
  });

  it('Saturday and breaks are reported as such', () => {
    expect(todayInfo(new Date(2026, 10, 14, 10, 0), meetingsFor).kind).toBe('shabbat');
    expect(todayInfo(new Date(2027, 1, 10, 10, 0), meetingsFor).kind).toBe('no-semester');
  });

  it('finds the next class after today', () => {
    const next = nextClassAfterToday(new Date(2026, 10, 12, 9, 0), meetingsFor); // чт → пн 16:00
    expect(next?.meeting.courseId).toBe('63254');
    expect(next?.date.getDay()).toBe(1);
  });
});

describe('campus walking («Беги!»)', () => {
  it('estimates walking minutes between buildings', () => {
    expect(walkMinutes('505', '505')).toBe(0);
    expect(walkMinutes('105', '505')).toBeGreaterThan(5);
    expect(walkMinutes('105', '902')).toBeGreaterThan(BREAK_BUFFER_MIN);
    expect(walkMinutes('105', 'nope')).toBeNull();
    expect(walkMinutes(undefined, '105')).toBeNull();
  });

  it('flags back-to-back classes on opposite ends of campus', () => {
    const sprints = findSprints([m(4, '14:00', '16:00', '105', 'a'), m(4, '16:00', '18:00', '902', 'b')]);
    expect(sprints).toHaveLength(1);
    expect(sprints[0]).toMatchObject({ available: BREAK_BUFFER_MIN });
  });

  it('nearby buildings or a real gap are fine', () => {
    expect(findSprints([m(4, '14:00', '16:00', '503', 'a'), m(4, '16:00', '18:00', '504', 'b')])).toEqual([]);
    expect(findSprints([m(4, '10:00', '12:00', '105', 'a'), m(4, '13:00', '14:00', '901', 'b')])).toEqual([]);
  });

  it('real coordinates: campus outline, building footprints, north campus and all gates', () => {
    expect(CAMPUS_OUTLINE.length).toBeGreaterThan(20);
    expect(BUILDING_OUTLINES.filter((b) => b.id).length).toBeGreaterThan(50);
    for (const id of ['1002', '1004', '1102', '1105', '503', '604', '105']) expect(metersOf(id), id).toBeDefined();
    for (const g of ['gate-1', 'gate-2', 'gate-5', 'gate-10', 'gate-15', 'gate-20', 'gate-25', 'gate-30', 'gate-40']) expect(isGate(g), g).toBe(true);
    // Северный кампус: от инженерного 1102 до 503 — около полукилометра пешком.
    expect(walkMeters('1102', '503')).toBeGreaterThan(400);
    expect(walkMeters('1102', '503')).toBeLessThan(900);
    // 101 → 901 по прямой ≈ 920 м (OSM), с поправкой на дорожки ≈ 1,2 км.
    expect(walkMeters('101', '901')).toBeGreaterThan(1100);
    expect(walkMeters('101', '901')).toBeLessThan(1300);
    expect(walkMeters('503', '504')).toBeLessThan(120);
  });

  it('builds a day route in time order', () => {
    const route = dayRoute(
      [m(3, '12:00', '14:00', '604', 'b'), m(3, '08:00', '10:00', '105', 'a'), m(2, '10:00', '12:00', '505', 'c')],
      3,
    );
    expect(route.stops.map((s) => s.courseId)).toEqual(['a', 'b']);
    expect(route.legs).toHaveLength(1);
    expect(route.legs[0]!.run).toBe(false);
  });

  it('a day journey goes gate → classes → gate and sums the walking', () => {
    const meetings = [m(4, '14:00', '16:00', '105', 'a'), m(4, '16:00', '18:00', '901', 'b')];
    const j = dayJourney(meetings, 4, 'gate-40');
    expect(j.stops.map((s) => s.courseId)).toEqual(['a', 'b']);
    expect(j.arrive).toBe(walkMinutes('gate-40', '105'));
    expect(j.leave).toBe(walkMinutes('901', 'gate-40'));
    expect(j.totalWalk).toBe(j.arrive! + j.leave! + j.legs[0]!.walk!);
  });

  it('without a gate only the walks between classes count', () => {
    const meetings = [m(4, '14:00', '16:00', '105', 'a'), m(4, '16:00', '18:00', '901', 'b')];
    const j = dayJourney(meetings, 4);
    expect(j.arrive).toBeNull();
    expect(j.totalWalk).toBe(j.legs[0]!.walk);
    expect(dayJourney(meetings, 2, 'gate-40')).toMatchObject({ stops: [], totalWalk: 0 });
  });

  it('the demo sprint course triggers a warning in the sample', () => {
    const plan: Plan = {
      v: 1,
      courses: [
        { courseId: '63256', color: 0, picks: { lecture: '18' } }, // ср 14–16, здание 105
        { courseId: '99003', color: 1, picks: { lecture: '01' } }, // ср 16–18, здание 902 (демо)
      ],
    };
    expect(findSprints(collectMeetings(plan, courseMap, 'A'))).toHaveLength(1);
  });
});
