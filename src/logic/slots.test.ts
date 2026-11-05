import { describe, expect, it } from 'vitest';
import { catalog, courseMap } from '../data/catalog';
import { collectMeetings } from './schedule';
import { EMPTY_PLAN, type Plan } from './selection';
import { hourSlot, optionsForSlot } from './slots';

const H = (h: number) => h * 60;

function ids(plan: Plan, semester: 'A' | 'B', day: 1 | 2 | 3 | 4 | 5 | 6, hour: number) {
  const current = collectMeetings(plan, courseMap, semester);
  return optionsForSlot(catalog.courses, plan, semester, hourSlot(day, H(hour)), current).map(
    (o) => `${o.course.courseId}-${o.section.sectionNumber}`,
  );
}

describe('optionsForSlot', () => {
  it('finds every group meeting in the slot', () => {
    expect(ids(EMPTY_PLAN, 'A', 3, 12).sort()).toEqual(['183138-01']);
    expect(ids(EMPTY_PLAN, 'A', 4, 14).sort()).toEqual(['63011-19', '63256-18']);
  });

  it('a long class matches every hour it covers, not the touching hour', () => {
    // 376030-01: среда 16:00–20:00, семестр B.
    expect(ids(EMPTY_PLAN, 'B', 4, 19)).toContain('376030-01');
    expect(ids(EMPTY_PLAN, 'B', 4, 20)).not.toContain('376030-01');
    expect(ids(EMPTY_PLAN, 'B', 4, 15)).not.toContain('376030-01');
  });

  it('respects the semester, including yearly courses', () => {
    expect(ids(EMPTY_PLAN, 'A', 1, 8)).toEqual([]);
    expect(ids(EMPTY_PLAN, 'B', 1, 8)).toEqual(['99002-02']);
    expect(ids(EMPTY_PLAN, 'A', 1, 10)).toContain('99001-01');
    expect(ids(EMPTY_PLAN, 'B', 1, 10)).toContain('99001-01');
    // 99001-02 в семестре A — четверг 14–16, в семестре B — 16–18.
    expect(ids(EMPTY_PLAN, 'A', 5, 14)).toContain('99001-02');
    expect(ids(EMPTY_PLAN, 'B', 5, 14)).not.toContain('99001-02');
  });

  it('returns nothing for an empty slot', () => {
    expect(ids(EMPTY_PLAN, 'A', 6, 12)).toEqual([]);
  });

  it('hides groups already picked and flags conflicts with the schedule', () => {
    const plan: Plan = { v: 1, courses: [{ courseId: '63256', color: 0, picks: { lecture: '18' } }] };
    const current = collectMeetings(plan, courseMap, 'A');
    const options = optionsForSlot(catalog.courses, plan, 'A', hourSlot(4, H(14)), current);
    expect(options.map((o) => o.course.courseId)).toEqual(['63011']);
    expect(options[0]!.conflicts).toBe(1);
  });

  it('marks courses already in the plan and ignores their own meetings as conflicts', () => {
    const plan: Plan = { v: 1, courses: [{ courseId: '63013', color: 0, picks: { lecture: '18' } }] };
    const current = collectMeetings(plan, courseMap, 'A');
    const [option] = optionsForSlot(catalog.courses, plan, 'A', hourSlot(1, H(12)), current);
    expect(option).toMatchObject({ inPlan: true, conflicts: 0 });
    expect(option!.section.sectionNumber).toBe('19');
  });

  it('touching the schedule is not a conflict', () => {
    // 711140-19: вс 14–16. Слот вс 12:00 → 63013-19 (12–14) встаёт впритык.
    const plan: Plan = { v: 1, courses: [{ courseId: '711140', color: 0, picks: { lecture: '19' } }] };
    const current = collectMeetings(plan, courseMap, 'A');
    const options = optionsForSlot(catalog.courses, plan, 'A', hourSlot(1, H(12)), current);
    expect(options.map((o) => [o.course.courseId, o.conflicts])).toEqual([['63013', 0]]);
  });
});
