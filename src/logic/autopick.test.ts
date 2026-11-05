import { describe, expect, it } from 'vitest';
import type { Course } from '../data/types';
import { courseMap } from '../data/catalog';
import { autoPick, courseOptions } from './autopick';

const get = (id: string) => courseMap.get(id) as Course;
const courses = (...ids: string[]) => ids.map(get);

describe('courseOptions', () => {
  it('respects linked exercises', () => {
    // 711081: лекция 18 + упражнение 20 или 21, лекция 19 + упражнение 22.
    const options = courseOptions(get('711081'), 'A').map((o) => o.picks);
    expect(options).toHaveLength(3);
    expect(options).toContainEqual({ lecture: '18', exercise: '20' });
    expect(options).toContainEqual({ lecture: '18', exercise: '21' });
    expect(options).toContainEqual({ lecture: '19', exercise: '22' });
  });

  it('is empty outside the course semester', () => {
    expect(courseOptions(get('63013'), 'B')).toEqual([]);
  });

  it('yearly course has options in both semesters', () => {
    expect(courseOptions(get('99001'), 'A').length).toBeGreaterThan(0);
    expect(courseOptions(get('99001'), 'B').length).toBeGreaterThan(0);
  });
});

describe('autoPick', () => {
  it('finds the least painful combination of groups', () => {
    // 63013: вт 08–10 или вс 12–14; 711140: пн 14–16 или вс 14–16.
    // Лучше всего — оба в воскресенье подряд: 1 день, без ранних и окон.
    const { results } = autoPick({
      courses: courses('63013', '711140'),
      required: new Set(['63013', '711140']),
      optionalToTake: 0,
      semester: 'A',
    });
    expect(results[0]!.picks).toEqual({ '63013': { lecture: '19' }, '711140': { lecture: '19' } });
    expect(results[0]!.misery.score).toBe(8);
    // Варианты отсортированы по возрастанию стоимости.
    const costs = results.map((r) => r.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });

  it('always includes required courses', () => {
    const { results } = autoPick({
      courses: courses('63013', '711140', '63254'),
      required: new Set(['63254']),
      optionalToTake: 1,
      semester: 'A',
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.taken).toContain('63254');
      expect(r.taken).toHaveLength(2);
      expect(r.skipped).toHaveLength(1);
    }
  });

  it('prefers conflict-free options even when they cost more days', () => {
    // 63256 — только ср 14–16. 63011: вт 14–16 или ср 14–16 (накладка).
    const { results } = autoPick({
      courses: courses('63256', '63011'),
      required: new Set(['63256', '63011']),
      optionalToTake: 0,
      semester: 'A',
    });
    expect(results[0]!.conflicts).toBe(0);
    expect(results[0]!.picks['63011']).toEqual({ lecture: '18' });
  });

  it('falls back to the fewest conflicts when nothing fits', () => {
    // Копия 63011 только с группой 19 (ср 14–16) неизбежно пересекается с 63256-18 (ср 14–16).
    const onlyWed: Course = { ...get('63011'), courseId: 'T1', sections: [get('63011').sections[1]!] };
    const { results } = autoPick({
      courses: [onlyWed, get('63256')],
      required: new Set(['T1', '63256']),
      optionalToTake: 0,
      semester: 'A',
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.conflicts).toBe(1);
  });

  it('chooses which optional courses to drop', () => {
    // Обязательный 63013; из 711140 и 63254 нужно взять один.
    const { results } = autoPick({
      courses: courses('63013', '711140', '63254'),
      required: new Set(['63013']),
      optionalToTake: 1,
      semester: 'A',
    });
    // Лучший: 63013-19 вс 12–14 + 711140-19 вс 14–16 → 8 баллов.
    expect(results[0]!.taken.sort()).toEqual(['63013', '711140']);
    expect(results[0]!.skipped).toEqual(['63254']);
    expect(results[0]!.cost).toBe(8);
  });

  it('clamps optionalToTake to the number of optional courses', () => {
    const { results } = autoPick({
      courses: courses('63013', '711140'),
      required: new Set(['63013']),
      optionalToTake: 5,
      semester: 'A',
    });
    expect(results[0]!.taken).toHaveLength(2);
  });

  it('ignores courses of the other semester', () => {
    const { results } = autoPick({
      courses: courses('63013', '711082'),
      required: new Set(['63013', '711082']),
      optionalToTake: 0,
      semester: 'A',
    });
    expect(results[0]!.taken).toEqual(['63013']);
  });

  it('reports a course with no valid group combination', () => {
    const broken: Course = {
      ...get('711081'),
      courseId: 'BROKEN',
      sections: get('711081').sections.filter((s) => s.type === 'exercise'),
    };
    // Только упражнения, привязанные к лекциям, которых нет, — собрать нельзя.
    const outcome = autoPick({
      courses: [broken, get('63013')],
      required: new Set(['BROKEN', '63013']),
      optionalToTake: 0,
      semester: 'A',
    });
    expect(outcome.unschedulable).toEqual(['BROKEN']);
    expect(outcome.results[0]!.taken).toEqual(['63013']);
  });

  it('handles courses without fixed time', () => {
    const { results } = autoPick({
      courses: courses('161053'),
      required: new Set(['161053']),
      optionalToTake: 0,
      semester: 'A',
    });
    expect(results[0]!.picks['161053']).toEqual({ lecture: '01' });
    expect(results[0]!.misery.score).toBe(0);
  });

  it('stops at the node limit and says so', () => {
    const outcome = autoPick({
      courses: courses('711081', '63013', '711140', '71204', '63011', '99001'),
      required: new Set(['711081', '63013', '711140', '71204', '63011', '99001']),
      optionalToTake: 0,
      semester: 'A',
      maxNodes: 5,
    });
    expect(outcome.truncated).toBe(true);
  });

  it('the full sample semester finishes without truncation', () => {
    const ids = ['711081', '711140', '63254', '63013', '71204', '183138', '63011', '63938', '63256', '161053', '99001'];
    const outcome = autoPick({
      courses: courses(...ids),
      required: new Set(ids),
      optionalToTake: 0,
      semester: 'A',
    });
    expect(outcome.truncated).toBe(false);
    expect(outcome.results.length).toBeGreaterThan(1);
    expect(outcome.results[0]!.conflicts).toBe(0);
  });
});
