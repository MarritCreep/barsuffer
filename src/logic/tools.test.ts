import { describe, expect, it } from 'vitest';
import type { NoClassPeriod, SemesterDates } from '../data/calendar';
import { courseMap } from '../data/catalog';
import { DEFAULT_REQUIRED, EMPTY_LOG, OLAMOT_RULE, miluimImpact, sectionAttendance, toggleAbsent } from './attendance';
import { DEFAULT_DEGREE, degreeProgress, emiRequired, englishLevelForScore, englishSteps, sanitizeDegree } from './degree';
import { demoPlan } from './demo';
import { examSeason, nextExam, type ExamEntry } from './exams';
import { heatWarning } from './heat';
import { buildIcs, escapeText, foldLine, occurrenceEvent } from './ics';
import type { PlacedMeeting } from './schedule';
import { collectMeetings } from './schedule';
import { heldOccurrences, holidayEffect, occurrences } from './sessions';
import { decodeShare, encodeShare, payloadFromHash, shareUrl } from './share';
import { compareSchedules } from './together';
import { moodOf, wakeFor } from './wake';

const meeting = (p: Partial<PlacedMeeting>): PlacedMeeting => ({
  key: p.key ?? 'k',
  courseId: '1',
  courseName: 'Course',
  sectionNumber: '18',
  type: 'lecture',
  day: 1,
  start: 600,
  end: 720,
  color: 0,
  isDemo: false,
  ...p,
});

// Короткий «семестр»: 2 недели, вс 2026-10-11 … сб 2026-10-24.
const CAL: SemesterDates[] = [{ semester: 'A', start: '2026-10-11', end: '2026-10-24' }];

describe('sessions', () => {
  it('lists every class date and skips holidays', () => {
    const m = meeting({ day: 1 }); // воскресенье
    const holiday: NoClassPeriod[] = [{ id: 'test', from: '2026-10-18', to: '2026-10-18', off: true }];
    const all = occurrences([m], 'A', CAL, holiday);
    expect(all.map((o) => o.date)).toEqual(['2026-10-11', '2026-10-18']);
    expect(all[1]!.cancelledBy).toBe('test');
    expect(heldOccurrences([m], 'A', CAL, holiday)).toHaveLength(1);
  });

  it('half days cancel later classes and shorten overlapping ones', () => {
    const p: NoClassPeriod = { id: 'eve', from: '2026-10-11', to: '2026-10-11', until: '13:00' };
    expect(holidayEffect({ start: 600, end: 720 }, p)).toBeNull();
    expect(holidayEffect({ start: 720, end: 840 }, p)).toBe('shortened');
    expect(holidayEffect({ start: 780, end: 900 }, p)).toBe('cancelled');
  });
});

describe('calendar export', () => {
  it('escapes and folds lines', () => {
    expect(escapeText('a,b;c\nd')).toBe('a\\,b\\;c\\nd');
    const long = 'SUMMARY:' + 'א'.repeat(60);
    const folded = foldLine(long);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
  });

  it('builds a calendar with local Israeli times', () => {
    const [o] = heldOccurrences([meeting({ start: 8 * 60 + 30, end: 10 * 60 })], 'A', CAL, []);
    const ics = buildIcs([occurrenceEvent(o!, { summary: 'Course — Lecture 18', location: '604-12' })], 'BarSuffer', new Date('2026-11-06T10:00:00Z'));
    expect(ics).toContain('DTSTART;TZID=Asia/Jerusalem:20261011T083000');
    expect(ics).toContain('DTEND;TZID=Asia/Jerusalem:20261011T100000');
    expect(ics).toContain('LOCATION:604-12');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('all-day events end the next day', () => {
    const ics = buildIcs([{ uid: 'x', date: '2026-12-31', summary: 'Exam' }], 'X');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });
});

describe('share link', () => {
  it('round-trips a plan without block labels or hidden courses', () => {
    const plan = demoPlan(courseMap);
    const withHidden = {
      ...plan,
      courses: [...plan.courses, { courseId: '63010', color: 9, picks: { lecture: '18' }, hidden: true }],
    };
    const url = shareUrl('https://x.test/barsuffer/#old', withHidden, '  Dana  ');
    const payload = payloadFromHash(new URL(url).hash);
    const decoded = decodeShare(payload!, courseMap)!;
    expect(decoded.name).toBe('Dana');
    expect(decoded.plan.courses.map((c) => [c.courseId, c.picks])).toEqual(plan.courses.map((c) => [c.courseId, c.picks]));
    expect(decoded.plan.blocks?.[0]).toMatchObject({ day: 3, startTime: '18:00', endTime: '19:30', label: '' });
    expect(decoded.dropped).toEqual([]);
  });

  it('drops unknown courses and groups, rejects garbage', () => {
    const payload = encodeShare({ v: 1, courses: [{ courseId: '00000', color: 0, picks: {} }, { courseId: '71204', color: 1, picks: { lecture: '18', exercise: '99' } }] });
    const decoded = decodeShare(payload, courseMap)!;
    expect(decoded.dropped).toEqual(['00000']);
    expect(decoded.plan.courses[0]!.picks).toEqual({ lecture: '18' });
    expect(decodeShare('!!!', courseMap)).toBeNull();
    expect(decodeShare('e30', courseMap)).toBeNull(); // "{}"
  });
});

describe('when are we both free', () => {
  it('finds shared classes and common gaps', () => {
    const mine = [meeting({ day: 1, start: 600, end: 720 }), meeting({ day: 1, start: 840, end: 960, courseId: '2' })];
    const theirs = [meeting({ day: 1, start: 600, end: 720 }), meeting({ day: 1, start: 780, end: 900, courseId: '3' })];
    const r = compareSchedules(mine, theirs);
    expect(r.shared).toHaveLength(1);
    // Оба в кампусе в воскресенье; общее окно 12:00–13:00.
    expect(r.free.filter((f) => f.day === 1 && f.onCampus)).toEqual([{ day: 1, start: 720, end: 780, onCampus: true }]);
    expect(r.bothOnCampus).toEqual([1]);
    expect(r.bothOff).toEqual([2, 3, 4, 5]);
  });
});

describe('attendance and reserve duty', () => {
  const m = meeting({ day: 1 });
  const held = heldOccurrences([m], 'A', CAL, []); // 2 встречи

  it('counts misses against the requirement', () => {
    const log = { ...EMPTY_LOG, rules: { '1': { kind: 'pct' as const, value: 50 } } };
    let [s] = sectionAttendance(held, log, '2026-10-20', 0);
    expect(s).toMatchObject({ total: 2, past: 2, missed: 0, allowed: 1, left: 1, status: 'tight' });
    [s] = sectionAttendance(held, toggleAbsent(log, held[0]!.key), '2026-10-20', 0);
    expect(s).toMatchObject({ missed: 1, left: 0 });
    expect(DEFAULT_REQUIRED).toBe(80);
    const [olamot] = sectionAttendance(held, { ...EMPTY_LOG, rules: { '1': OLAMOT_RULE } }, '2026-10-20', 0);
    expect(olamot).toMatchObject({ allowed: 2, left: 2 });
  });

  it('reserve duty removes the sessions inside the period', () => {
    const log = { ...EMPTY_LOG, miluim: [{ id: 'm1', from: '2026-10-15', to: '2026-10-30' }] };
    const [s] = sectionAttendance(held, log, '2026-10-01', 0);
    expect(s).toMatchObject({ missedMiluim: 1, status: 'over' }); // 80% из 2 → можно 0
    const [impact] = miluimImpact(held, log.miluim);
    expect(impact).toMatchObject({ sessions: 1, classDays: 1 });
  });
});

describe('alarm', () => {
  it('works back from the first class', () => {
    const w = wakeFor([meeting({ day: 2, start: 8 * 60, end: 600 })], 2, { commuteMinutes: 40, prepMinutes: 30, sleepHours: 8 })!;
    expect(w.leave).toBe(8 * 60 - 50);
    expect(w.wake).toBe(6 * 60 + 40);
    expect(w.bedtime).toBe(22 * 60 + 40);
    expect(w.mood).toBe('early');
    expect(wakeFor([], 2, { commuteMinutes: 0 })).toBeNull();
    expect(moodOf(5 * 60)).toBe('brutal');
  });
});

describe('khamsin', () => {
  const hourly = {
    time: ['2026-11-06T10:00', '2026-11-06T11:00', '2026-11-06T12:00', '2026-11-06T16:00'],
    temperature_2m: [29, 33.4, 31, 38],
  };
  it('warns about heat only during campus hours', () => {
    expect(heatWarning(hourly, '2026-11-06', { start: 600, end: 780 }, 12)).toEqual({ max: 33, at: 660, level: 'hot', walkMinutes: 12 });
    expect(heatWarning(hourly, '2026-11-06', { start: 600, end: 650 }, 0)).toBeNull();
    expect(heatWarning(hourly, '2026-11-06', { start: 900, end: 1020 }, 0)?.level).toBe('extreme');
  });
});

describe('exams', () => {
  const e = (id: string, date: string, moed: ExamEntry['moed'] = 'A'): ExamEntry => ({ id, label: id, moed, date });
  it('scores the season by how little time there is between exams', () => {
    const season = examSeason([e('a', '2027-01-25'), e('b', '2027-01-27'), e('c', '2027-01-27'), e('d', '2027-02-10', 'B')], 'A');
    expect(season.exams.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(season.gaps.map((g) => g.studyDays)).toEqual([1, 0]);
    expect(season.sameDay).toHaveLength(1);
    expect(season.tightest?.to.id).toBe('c');
    expect(season.score).toBe(20 + 30 + 25 + 3 * 4);
    expect(nextExam([e('a', '2027-01-25'), e('b', '2027-01-20')], '2027-01-21')?.id).toBe('a');
  });
});

describe('demo schedule', () => {
  it('uses only catalog courses and complete picks', () => {
    const plan = demoPlan(courseMap);
    expect(plan.courses.length).toBeGreaterThanOrEqual(8);
    expect(collectMeetings(plan, courseMap, 'A').length).toBeGreaterThan(5);
    expect(collectMeetings(plan, courseMap, 'B').length).toBeGreaterThan(3);
  });
});

describe('degree progress', () => {
  it('maps English scores to levels and required courses', () => {
    expect(englishLevelForScore(84)).toBe('preBasicB');
    expect(englishLevelForScore(85)).toBe('basic');
    expect(englishLevelForScore(119)).toBe('advA');
    expect(englishLevelForScore(133)).toBe('advB');
    expect(englishLevelForScore(134)).toBe('exempt');
    expect(englishSteps('basic')).toEqual(['basic', 'advA', 'advB']);
    expect(englishSteps('exempt')).toEqual([]);
    expect([emiRequired('advA'), emiRequired('advB'), emiRequired('exempt')]).toEqual([0, 1, 2]);
  });

  it('honours Olamot exemptions and reduced tracks', () => {
    const base = { ...DEFAULT_DEGREE, courses: [{ id: 'a', name: 'Bible', credits: 4, bucket: 'olamot' as const, status: 'done' as const }] };
    expect(degreeProgress(base).olamot).toEqual({ done: 4, now: 0, target: 20 });
    expect(degreeProgress({ ...base, olamotTrack: 'law' }).olamot.target).toBe(4);
    expect(degreeProgress({ ...base, olamotTrack: 'exempt' }).olamot.target).toBe(0);
    const nonJewish = degreeProgress({ ...base, olamotTrack: 'nonJewish' });
    expect(nonJewish.olamot.target).toBe(0);
    expect(nonJewish.general?.target).toBe(20);
    expect(degreeProgress({ ...base, olamotTrack: 'custom', olamotCustom: 6 }).olamot.target).toBe(6);
  });

  it('warns about the English deadline and Olamot pacing', () => {
    const state = {
      ...DEFAULT_DEGREE,
      year: 2 as const,
      courses: [{ id: 'o', name: 'O', credits: 24, bucket: 'olamot' as const, status: 'now' as const }],
    };
    const p = degreeProgress(state);
    expect(p.warnings).toContain('englishDeadline');
    expect(p.warnings).toContain('olamotYearCap');
    expect(p.warnings).toContain('hebrewYear1');
    const done = degreeProgress({ ...state, englishLevel: 'exempt', hebrew: 'exempt', courses: [] });
    expect(done.english.emi.target).toBe(2);
    expect(done.warnings).toEqual([]);
  });

  it('sanitizes stored state', () => {
    expect(sanitizeDegree(null)).toEqual(DEFAULT_DEGREE);
    const s = sanitizeDegree({ v: 1, year: 9, olamotTrack: 'nope', englishDone: ['basic', 'x'], courses: [{ id: 1 }] });
    expect(s.year).toBe(1);
    expect(s.olamotTrack).toBe('standard');
    expect(s.englishDone).toEqual(['basic']);
    expect(s.courses).toEqual([]);
  });
});