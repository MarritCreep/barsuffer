import { describe, expect, it } from 'vitest';
import { catalog } from '../data/catalog';
import type { Course } from '../data/types';
import {
  EMPTY_FILTER,
  ONLINE,
  SELF,
  activeCount,
  buildFacets,
  filterCourses,
  matchFilter,
  sanitizeFilter,
  sectionPlaces,
  toggleValue,
} from './filters';
import { hourSlot } from './slots';

const course = (p: Partial<Course>): Course => ({
  courseId: '1',
  name: 'Course',
  credits: 2,
  term: 'A',
  sections: [],
  ...p,
});

const seminarWed = course({
  courseId: '10',
  name: 'Seminar on Wednesday',
  departmentId: 'd1',
  categories: ['general'],
  language: 'en',
  sections: [
    { sectionNumber: '01', type: 'lecture', schedule: [{ day: 2, startTime: '10:00', endTime: '12:00', building: '505' }] },
    { sectionNumber: '02', type: 'seminar', schedule: [{ day: 4, startTime: '12:00', endTime: '14:00', building: '505' }] },
  ],
});
const zoom = course({
  courseId: '20',
  name: 'Online course',
  credits: 4,
  term: 'B',
  departmentId: 'd2',
  categories: ['olamot'],
  language: 'he',
  sections: [{ sectionNumber: '01', type: 'lecture', schedule: [{ day: 4, startTime: '12:00', endTime: '13:00', online: true }] }],
});
const selfPaced = course({
  courseId: '30',
  name: 'Self-learning',
  term: 'year',
  sections: [{ sectionNumber: '01', type: 'other', schedule: [] }],
});
const ALL = [seminarWed, zoom, selfPaced];
const CTX = { catalog: { departments: [{ id: 'd1', name: 'Asian Studies', facultyId: 'hum' }, { id: 'd2', name: 'Olamot' }] } };

describe('course filters', () => {
  it('empty filter matches everything', () => {
    expect(filterCourses(ALL, EMPTY_FILTER)).toHaveLength(3);
    expect(activeCount(EMPTY_FILTER)).toBe(0);
  });

  it('course-level groups: AND between groups, OR inside', () => {
    expect(filterCourses(ALL, { ...EMPTY_FILTER, terms: ['A', 'year'] }).map((c) => c.courseId)).toEqual(['10', '30']);
    expect(filterCourses(ALL, { ...EMPTY_FILTER, categories: ['olamot', 'general'] }).map((c) => c.courseId)).toEqual(['10', '20']);
    expect(filterCourses(ALL, { ...EMPTY_FILTER, categories: ['general'], credits: [4] })).toEqual([]);
    expect(filterCourses(ALL, { ...EMPTY_FILTER, languages: ['he'] }).map((c) => c.courseId)).toEqual(['20']);
    expect(filterCourses(ALL, { ...EMPTY_FILTER, faculties: ['hum'] }, CTX).map((c) => c.courseId)).toEqual(['10']);
    expect(filterCourses(ALL, { ...EMPTY_FILTER, departments: ['d2'] }).map((c) => c.courseId)).toEqual(['20']);
  });

  it('group-level criteria must hold for one group at the same time', () => {
    // Семинар в среду есть; лекции в среду нет (лекция — во вторник).
    expect(matchFilter(seminarWed, { ...EMPTY_FILTER, types: ['seminar'], days: [4] })?.map((s) => s.sectionNumber)).toEqual(['02']);
    expect(matchFilter(seminarWed, { ...EMPTY_FILTER, types: ['lecture'], days: [4] })).toBeNull();
  });

  it('time from–to keeps meetings inside the window', () => {
    const f = { ...EMPTY_FILTER, timeFrom: 12 * 60, timeTo: 14 * 60 };
    expect(filterCourses(ALL, f).map((c) => c.courseId)).toEqual(['10', '20']);
    expect(filterCourses(ALL, { ...f, timeTo: 13 * 60 }).map((c) => c.courseId)).toEqual(['20']);
  });

  it('places: buildings, online and self-learning', () => {
    expect([...sectionPlaces(zoom.sections[0]!)]).toEqual([ONLINE]);
    expect([...sectionPlaces(selfPaced.sections[0]!)]).toEqual([SELF]);
    expect(filterCourses(ALL, { ...EMPTY_FILTER, places: [ONLINE, SELF] }).map((c) => c.courseId)).toEqual(['20', '30']);
    expect(filterCourses(ALL, { ...EMPTY_FILTER, places: ['505'] }).map((c) => c.courseId)).toEqual(['10']);
  });

  it('slot mode: only groups meeting in that hour of that semester, other filters still apply', () => {
    const slot = { semester: 'A' as const, span: hourSlot(4, 12 * 60) };
    expect(filterCourses(ALL, EMPTY_FILTER, { slot }).map((c) => c.courseId)).toEqual(['10']);
    const slotB = { semester: 'B' as const, span: hourSlot(4, 12 * 60) };
    expect(filterCourses(ALL, EMPTY_FILTER, { slot: slotB }).map((c) => c.courseId)).toEqual(['20']);
    expect(filterCourses(ALL, { ...EMPTY_FILTER, categories: ['general'] }, { slot: slotB })).toEqual([]);
    // День/время левой панели в режиме клетки не мешают.
    expect(filterCourses(ALL, { ...EMPTY_FILTER, days: [1] }, { slot })).toHaveLength(1);
  });

  it('facets list only values that exist, with counts', () => {
    const facets = buildFacets({ courses: ALL, departments: CTX.catalog.departments });
    expect(facets.terms).toEqual([
      { value: 'A', count: 1 },
      { value: 'B', count: 1 },
      { value: 'year', count: 1 },
    ]);
    expect(facets.places.map((p) => p.value)).toEqual(['505', ONLINE, SELF]);
    expect(facets.faculties).toEqual([{ value: 'hum', count: 1 }]);
    expect(facets.credits).toEqual([
      { value: 2, count: 2 },
      { value: 4, count: 1 },
    ]);
  });

  it('works on the sample catalog (demo metadata)', () => {
    const facets = buildFacets(catalog);
    expect(facets.departments.map((d) => d.value)).toEqual(['demo-media', 'demo-writing']);
    expect(facets.places.some((p) => p.value === ONLINE)).toBe(true);
    expect(facets.places.some((p) => p.value === SELF)).toBe(true);
    expect(filterCourses(catalog.courses, { ...EMPTY_FILTER, categories: ['olamot'] }).map((c) => c.courseId)).toEqual(['99003']);
  });

  it('toggles and sanitizes', () => {
    const f = toggleValue(toggleValue(EMPTY_FILTER, 'days', 3), 'days', 5);
    expect(f.days).toEqual([3, 5]);
    expect(toggleValue(f, 'days', 3).days).toEqual([5]);
    expect(activeCount({ ...f, timeFrom: 600 })).toBe(2);
    expect(activeCount({ ...f, timeFrom: 600 }, ['days', 'time'])).toBe(0);
    expect(sanitizeFilter({ terms: ['A', 'Z'], days: [3, 9], timeFrom: -5, places: ['505', 7] })).toMatchObject({
      terms: ['A'],
      days: [3],
      timeFrom: null,
      places: ['505'],
    });
  });
});
