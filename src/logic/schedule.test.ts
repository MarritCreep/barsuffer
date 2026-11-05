import { describe, expect, it } from 'vitest';
import type { Course } from '../data/types';
import { catalog, courseMap } from '../data/catalog';
import type { Plan } from './selection';
import {
  assignLanes,
  collectMeetings,
  collectUnscheduled,
  findConflicts,
  overlaps,
  sectionMeetings,
  type PlacedMeeting,
} from './schedule';

function meeting(day: 1 | 2 | 3 | 4 | 5 | 6, start: string, end: string, id = 'x'): PlacedMeeting {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return {
    key: `${id}-${day}-${start}`,
    courseId: id,
    courseName: id,
    sectionNumber: '01',
    type: 'lecture',
    day,
    start: sh! * 60 + sm!,
    end: eh! * 60 + em!,
    color: 0,
    isDemo: false,
  };
}

describe('overlaps', () => {
  it('touching classes are not a conflict', () => {
    expect(overlaps(meeting(3, '10:00', '12:00'), meeting(3, '12:00', '14:00'))).toBe(false);
  });

  it('partial overlap is a conflict', () => {
    expect(overlaps(meeting(3, '10:00', '12:00'), meeting(3, '11:30', '13:00'))).toBe(true);
  });

  it('containment is a conflict', () => {
    expect(overlaps(meeting(3, '10:00', '14:00'), meeting(3, '11:00', '12:00'))).toBe(true);
  });

  it('same time on different days is not a conflict', () => {
    expect(overlaps(meeting(2, '10:00', '12:00'), meeting(3, '10:00', '12:00'))).toBe(false);
  });
});

describe('findConflicts', () => {
  it('finds every overlapping pair', () => {
    const conflicts = findConflicts([
      meeting(4, '14:00', '16:00', 'a'),
      meeting(4, '15:00', '17:00', 'b'),
      meeting(4, '15:30', '16:30', 'c'),
      meeting(4, '17:00', '18:00', 'd'),
    ]);
    const pairs = conflicts.map((c) => [c.a.courseId, c.b.courseId].sort().join('+')).sort();
    expect(pairs).toEqual(['a+b', 'a+c', 'b+c']);
  });

  it('detects conflicts for a multi-day section on each of its days', () => {
    // 71052 встречается в понедельник и в среду.
    const plan: Plan = {
      v: 1,
      courses: [
        { courseId: '71052', color: 0, picks: { lecture: '18' } },
        { courseId: '99002', color: 1, picks: {} },
      ],
    };
    const meetings = collectMeetings(plan, courseMap, 'B');
    expect(meetings.filter((m) => m.courseId === '71052').map((m) => m.day)).toEqual([2, 4]);
    const extra = [...meetings, meeting(2, '17:00', '18:00', 'mon'), meeting(4, '15:00', '16:00', 'wed')];
    const conflictDays = findConflicts(extra).map((c) => c.a.day).sort();
    expect(conflictDays).toEqual([2, 4]);
  });
});

describe('semesters and yearly courses', () => {
  const yearly = courseMap.get('99001') as Course;

  it('yearly course appears in both semesters', () => {
    const s01 = yearly.sections.find((s) => s.sectionNumber === '01')!;
    expect(sectionMeetings(yearly, s01, 'A')).toHaveLength(1);
    expect(sectionMeetings(yearly, s01, 'B')).toHaveLength(1);
  });

  it('respects per-semester meetings of a yearly section', () => {
    const s02 = yearly.sections.find((s) => s.sectionNumber === '02')!;
    expect(sectionMeetings(yearly, s02, 'A').map((m) => m.startTime)).toEqual(['14:00']);
    expect(sectionMeetings(yearly, s02, 'B').map((m) => m.startTime)).toEqual(['16:00']);
  });

  it('semester-A course does not appear in semester B', () => {
    const plan: Plan = { v: 1, courses: [{ courseId: '63013', color: 0, picks: { lecture: '18' } }] };
    expect(collectMeetings(plan, courseMap, 'A')).toHaveLength(1);
    expect(collectMeetings(plan, courseMap, 'B')).toHaveLength(0);
  });

  it('lists sections without a fixed time separately', () => {
    const plan: Plan = {
      v: 1,
      courses: [{ courseId: '71204', color: 0, picks: { lecture: '18', exercise: '19' } }],
    };
    expect(collectMeetings(plan, courseMap, 'A')).toHaveLength(1);
    expect(collectUnscheduled(plan, courseMap, 'A').map((u) => u.section.sectionNumber)).toEqual(['18']);
  });
});

describe('assignLanes', () => {
  it('puts overlapping blocks side by side and the rest full width', () => {
    const lanes = assignLanes([
      meeting(4, '14:00', '16:00', 'a'),
      meeting(4, '15:00', '17:00', 'b'),
      meeting(4, '18:00', '19:00', 'c'),
    ]);
    const byId = Object.fromEntries(lanes.map((l) => [l.item.courseId, l]));
    expect(byId.a).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.b).toMatchObject({ lane: 1, lanes: 2 });
    expect(byId.c).toMatchObject({ lane: 0, lanes: 1 });
  });
});

describe('sample catalog', () => {
  it('has unique course ids and unique section numbers per course', () => {
    const ids = catalog.courses.map((c) => c.courseId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const course of catalog.courses) {
      const nums = course.sections.map((s) => s.sectionNumber);
      expect(new Set(nums).size, course.courseId).toBe(nums.length);
    }
  });

  it('linkedTo references existing sections of another type', () => {
    for (const course of catalog.courses) {
      for (const section of course.sections) {
        for (const ref of section.linkedTo ?? []) {
          const target = course.sections.find((s) => s.sectionNumber === ref);
          expect(target, `${course.courseId}-${section.sectionNumber} → ${ref}`).toBeDefined();
          expect(target!.type).not.toBe(section.type);
        }
      }
    }
  });
});
