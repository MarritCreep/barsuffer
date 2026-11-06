import { describe, expect, it } from 'vitest';
import { courseMap } from '../data/catalog';
import { MISERY_WEIGHTS } from '../logic/misery';
import type { Plan } from '../logic/selection';
import { backupFileName, makeBackup, readBackup } from './backup';
import { DEFAULT_SETTINGS } from './settings';

const plan: Plan = {
  v: 1,
  courses: [
    { courseId: '63013', color: 0, picks: { lecture: '18' }, required: true },
    { courseId: '711081', color: 1, picks: { lecture: '19', exercise: '22' }, hidden: true },
  ],
  blocks: [{ id: 'b1', label: 'Work', day: 4, startTime: '15:00', endTime: '19:00' }],
};
const settings = { commuteMinutes: 45, weights: { ...MISERY_WEIGHTS, friday: 30 }, gate: 'gate-40' };

describe('backup file', () => {
  it('round-trips the schedule and settings', () => {
    const result = readBackup(makeBackup(plan, settings), courseMap);
    expect(result).toEqual({ ok: true, plan, settings, dropped: [] });
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-11-06T10:00:00Z'))).toBe('barsuffer-2026-11-06.json');
  });

  it('rejects files that are not ours', () => {
    expect(readBackup('hello', courseMap)).toMatchObject({ ok: false });
    expect(readBackup(JSON.stringify({ app: 'other' }), courseMap)).toMatchObject({ ok: false });
    expect(readBackup(JSON.stringify({ app: 'barsuffer', version: 99, plan }), courseMap)).toMatchObject({
      ok: false,
      code: 'newer',
      error: expect.stringMatching(/newer version/),
    });
    expect(readBackup(JSON.stringify({ app: 'barsuffer', version: 1, plan: { v: 1 } }), courseMap)).toMatchObject({
      ok: false,
    });
  });

  it('drops courses that are not in the catalog and says which', () => {
    const withUnknown: Plan = { ...plan, courses: [...plan.courses, { courseId: '12345', color: 2, picks: {} }] };
    const result = readBackup(makeBackup(withUnknown, settings), courseMap);
    expect(result).toMatchObject({ ok: true, dropped: ['12345'] });
    if (result.ok) expect(result.plan.courses).toHaveLength(2);
  });

  it('cleans up broken settings instead of failing', () => {
    const text = JSON.stringify({ app: 'barsuffer', version: 1, plan, settings: { commuteMinutes: -5, gate: 'x' } });
    const result = readBackup(text, courseMap);
    expect(result).toMatchObject({ ok: true, settings: DEFAULT_SETTINGS });
  });
});
