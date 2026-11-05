import { describe, expect, it } from 'vitest';
import type { Course } from '../data/types';
import { courseMap } from '../data/catalog';
import {
  autoPicks,
  isCompatible,
  missingTypes,
  nextColor,
  requiredTypes,
  selectSection,
  toggleSection,
} from './selection';

// 711081: лекции 18 и 19 (демо), упражнения 20, 21 → лекция 18, упражнение 22 → лекция 19.
const political = courseMap.get('711081') as Course;

describe('requiredTypes / missingTypes', () => {
  it('lists every session type of the course', () => {
    expect(requiredTypes(political)).toEqual(['lecture', 'exercise']);
  });

  it('reports what is still missing', () => {
    expect(missingTypes(political, { lecture: '18' })).toEqual(['exercise']);
    expect(missingTypes(political, { lecture: '18', exercise: '20' })).toEqual([]);
  });
});

describe('linked sections', () => {
  it('selecting an exercise auto-selects its lecture', () => {
    expect(selectSection(political, {}, '22')).toEqual({ exercise: '22', lecture: '19' });
  });

  it('selecting an exercise of another lecture switches the lecture', () => {
    expect(selectSection(political, { lecture: '18', exercise: '20' }, '22')).toEqual({
      lecture: '19',
      exercise: '22',
    });
  });

  it('switching the lecture drops an exercise that no longer fits', () => {
    expect(selectSection(political, { lecture: '18', exercise: '20' }, '19')).toEqual({ lecture: '19' });
  });

  it('switching between compatible exercises keeps the lecture', () => {
    expect(selectSection(political, { lecture: '18', exercise: '20' }, '21')).toEqual({
      lecture: '18',
      exercise: '21',
    });
  });

  it('isCompatible checks linkedTo against picks of other types', () => {
    const ex22 = political.sections.find((s) => s.sectionNumber === '22')!;
    expect(isCompatible(ex22, { lecture: '19' })).toBe(true);
    expect(isCompatible(ex22, { lecture: '18' })).toBe(false);
  });

  it('unlinked sections combine freely', () => {
    const stats = courseMap.get('71204') as Course;
    expect(selectSection(stats, { lecture: '18' }, '20')).toEqual({ lecture: '18', exercise: '20' });
  });
});

describe('toggleSection', () => {
  it('second tap on a selected group unselects it and its dependants', () => {
    expect(toggleSection(political, { lecture: '18', exercise: '20' }, '18')).toEqual({});
  });

  it('tap on another group selects it', () => {
    expect(toggleSection(political, { lecture: '18' }, '19')).toEqual({ lecture: '19' });
  });
});

describe('autoPicks', () => {
  it('picks the only option of each type', () => {
    const workshop = courseMap.get('63938') as Course;
    expect(autoPicks(workshop)).toEqual({ workshop: '18', other: '19' });
  });

  it('leaves types with several options empty', () => {
    expect(autoPicks(political)).toEqual({});
  });
});

describe('nextColor', () => {
  it('reuses freed colors', () => {
    expect(
      nextColor({
        v: 1,
        courses: [
          { courseId: 'a', color: 0, picks: {} },
          { courseId: 'b', color: 2, picks: {} },
        ],
      }),
    ).toBe(1);
  });
});
