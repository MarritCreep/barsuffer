import { describe, expect, it } from 'vitest';
import type { Course } from '../data/types';
import { courseMap } from '../data/catalog';
import { collectMeetings } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import { planReducer } from './planReducer';

const course = (id: string) => courseMap.get(id) as Course;

const base: Plan = {
  v: 1,
  courses: [
    { courseId: '63013', color: 0, picks: { lecture: '18' } },
    { courseId: '711140', color: 1, picks: { lecture: '18' } },
    { courseId: '63254', color: 2, picks: { workshop: '18' } },
  ],
};

describe('planReducer', () => {
  it('marks a course as required', () => {
    const next = planReducer(base, { kind: 'setRequired', courseId: '63013', required: true });
    expect(next.courses[0]!.required).toBe(true);
    // Повторная отметка ничего не меняет — для истории это no-op.
    expect(planReducer(next, { kind: 'setRequired', courseId: '63013', required: true })).toBe(next);
  });

  it('hidden courses leave the grid but stay in the list', () => {
    const next = planReducer(base, { kind: 'setHidden', courseId: '63254', hidden: true });
    expect(next.courses).toHaveLength(3);
    expect(collectMeetings(next, courseMap, 'A').map((m) => m.courseId)).not.toContain('63254');
  });

  it('applyAuto sets picks and hides skipped optional courses', () => {
    const next = planReducer(base, {
      kind: 'applyAuto',
      picks: { '63013': { lecture: '19' }, '711140': { lecture: '19' } },
      skipped: ['63254'],
    });
    expect(next.courses.map((c) => [c.courseId, c.picks, Boolean(c.hidden)])).toEqual([
      ['63013', { lecture: '19' }, false],
      ['711140', { lecture: '19' }, false],
      ['63254', { workshop: '18' }, true],
    ]);
  });

  it('picking a group of a hidden course brings it back', () => {
    const hidden = planReducer(base, { kind: 'setHidden', courseId: '63013', hidden: true });
    const next = planReducer(hidden, { kind: 'select', course: course('63013'), sectionNumber: '19' });
    expect(next.courses[0]).toMatchObject({ hidden: false, picks: { lecture: '19' } });
  });

  it('removing an unknown course is a no-op', () => {
    expect(planReducer(base, { kind: 'remove', courseId: 'nope' })).toBe(base);
  });
});
