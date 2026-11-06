import { describe, expect, it } from 'vitest';
import type { Course } from '../data/types';
import { courseMap } from '../data/catalog';
import fixture from './fixtures/inbar-schedule.json';
import { applyImport, buildImport, parseInbarPdf, type PdfPage } from './inbar';
import { computeMisery } from './misery';
import { collectMeetings } from './schedule';
import type { Plan } from './selection';

// Обезличенный снимок текста из PDF, экспортированного в Инбаре (без строки «Logged in as …»).
const pages = (fixture as { pages: PdfPage[] }).pages;
const parsed = parseInbarPdf(pages);

describe('parseInbarPdf', () => {
  it('reads every class of both semesters', () => {
    expect(parsed.warnings).toEqual([]);
    expect(parsed.meetings.filter((m) => m.semester === 'A')).toHaveLength(9);
    expect(parsed.meetings.filter((m) => m.semester === 'B')).toHaveLength(8);
  });

  it('gets course, group, day, time, lecturer and room right', () => {
    const intro = parsed.meetings.find((m) => m.courseId === '711140')!;
    expect(intro).toMatchObject({
      semester: 'A',
      group: '18',
      name: 'Intro to Public Administration and Public Policy A',
      day: 2,
      start: 14 * 60,
      end: 16 * 60,
      lecturer: 'Barak Bouks',
      building: '505',
      room: '202',
      isLecture: true,
    });
  });

  it('joins titles and names wrapped over several lines and pages', () => {
    const citizen = parsed.meetings.find((m) => m.courseId === '63256')!;
    expect(citizen.name).toBe('Citizen Diplomacy in the Social Media & "Peer2Peer" Networks Age');
    expect(citizen).toMatchObject({ day: 4, start: 14 * 60, building: '105', room: '101' });
    expect(parsed.meetings.find((m) => m.courseId === '71204')).toMatchObject({ group: '19', day: 3 });
    expect(parsed.meetings.find((m) => m.courseId === '63009')!.lecturer).toBe('Elie Friedman');
  });

  it('keeps every meeting of a group that meets twice a week', () => {
    const terror = parsed.meetings.filter((m) => m.courseId === '71052').map((m) => [m.day, m.start]);
    expect(terror).toEqual([
      [2, 16 * 60],
      [4, 14 * 60],
    ]);
  });

  it('reads “Additional Lessons” without a fixed time', () => {
    expect(parsed.untimed).toEqual([
      { semester: 'A', courseId: '161053', group: '01', name: 'Jerusalem: From its beginnings to the Muslim Conquest' },
      { semester: 'A', courseId: '71204', group: '18', name: 'Statistics and Computer Usage' },
      { semester: 'A', courseId: '63938', group: '19', name: 'Video Journalism Workshop' },
    ]);
  });

  it('never picks up the browser header or footer', () => {
    const text = JSON.stringify(parsed);
    expect(text).not.toMatch(/inbar\.biu\.ac\.il|05\.11\.2026|Schedule/);
  });

  it('explains a PDF that is not an Inbar schedule', () => {
    const result = parseInbarPdf([{ height: 800, items: [{ str: 'Hello', x: 100, y: 400, w: 30, font: 'f1' }] }]);
    expect(result.meetings).toEqual([]);
    expect(result.warnings[0]).toMatchObject({ code: 'noHeader', message: expect.stringMatching(/weekday header/) });
  });
});

describe('three kinds of Inbar prints', () => {
  // Распечатки одного семестра собраны из годовой: та же вёрстка, другой выбор в списке.
  const rename = (page: PdfPage, from: string, to: string): PdfPage => ({
    ...page,
    items: page.items.map((it) => (it.str === from ? { ...it, str: to } : it)),
  });
  const cut = (page: PdfPage, keep: (y: number) => boolean): PdfPage => ({
    ...page,
    items: page.items.filter((it) => keep(it.y) || it.y > page.height - 30 || it.y < 26),
  });
  const [p1, p2, p3, p4] = pages as [PdfPage, PdfPage, PdfPage, PdfPage];
  const semAOnly = [rename(p1, 'All Semesters', '1st Semester'), cut(p2, (y) => y > 440), cut(p3, (y) => y < 90), p4];
  const semBOnly = [
    { height: p1.height, items: [{ ...p1.items.find((i) => i.str === 'All Semesters')!, str: '2nd Semester' }] },
    cut(p2, (y) => y < 440),
    p3,
    p4,
  ];

  it('the whole-year print covers both semesters', () => {
    expect(parsed.scope).toBe('year');
  });

  it('a Semester A print', () => {
    const r = parseInbarPdf(semAOnly);
    expect(r.scope).toBe('A');
    expect(r.meetings).toHaveLength(9);
    expect(r.meetings.every((m) => m.semester === 'A')).toBe(true);
    expect(r.untimed).toHaveLength(3);
  });

  it('a Semester B print ignores “Additional Lessons” of the other semester', () => {
    const r = parseInbarPdf(semBOnly);
    expect(r.scope).toBe('B');
    expect(r.meetings).toHaveLength(8);
    expect(r.meetings.every((m) => m.semester === 'B')).toBe(true);
    expect(r.untimed).toEqual([]);
  });

  it('a print without any semester label asks which semester it is', () => {
    const unlabeled = semAOnly.map((p) => ({ ...p, items: p.items.filter((i) => !/Semester$/.test(i.str)) }));
    expect(parseInbarPdf(unlabeled).scope).toBe('unknown');
    const asB = parseInbarPdf(unlabeled, { fallbackSemester: 'B' });
    expect(asB.scope).toBe('B');
    expect(asB.meetings.every((m) => m.semester === 'B')).toBe(true);
  });

  it('replacing with a Semester A print keeps Semester B courses', () => {
    const existing: Plan = {
      v: 1,
      courses: [
        { courseId: '63013', color: 0, picks: { lecture: '19' } }, // семестр A
        { courseId: '63254', color: 1, picks: { workshop: '18' } }, // семестр A, нет в распечатке
        { courseId: '63010', color: 2, picks: { lecture: '18' } }, // семестр B
      ],
    };
    const r = parseInbarPdf(semAOnly);
    // Убираем 63254 из распечатки, чтобы проверить, что «заменить» его удалит.
    const imp = buildImport({ ...r, meetings: r.meetings.filter((m) => m.courseId !== '63254') }, courseMap);
    const next = applyImport(existing, imp, 'replace', r.scope, courseMap);
    const ids = next.courses.map((c) => c.courseId);
    expect(ids).toContain('63010');
    expect(ids).not.toContain('63254');
    expect(next.courses.find((c) => c.courseId === '63013')!.picks).toEqual({ lecture: '18' });
  });
});

describe('buildImport', () => {
  it('maps every group onto the catalog — the control schedule scores 30 and 41', () => {
    const imp = buildImport(parsed, courseMap);
    expect(imp.issues).toEqual([]);
    expect(imp.mismatches).toEqual([]);
    expect(imp.planned).toHaveLength(17);
    expect(imp.planned.find((p) => p.courseId === '71204')!.picks).toEqual({ lecture: '18', exercise: '19' });
    expect(imp.planned.find((p) => p.courseId === '63938')!.picks).toEqual({ workshop: '18', other: '19' });

    const plan = applyImport({ v: 1, courses: [] }, imp, 'replace');
    expect(computeMisery(collectMeetings(plan, courseMap, 'A')).score).toBe(30);
    expect(computeMisery(collectMeetings(plan, courseMap, 'B')).score).toBe(41);
  });

  it('a course missing from our catalog is an error, the rest are still added', () => {
    const catalog = new Map(courseMap);
    catalog.delete('376030');
    const imp = buildImport(parsed, catalog);
    expect(imp.issues).toEqual([
      { courseId: '376030', name: 'Graphic Novel', semester: 'B', reason: 'unknown-course' },
    ]);
    expect(imp.planned).toHaveLength(16);
    expect(imp.planned.some((p) => p.courseId === '376030')).toBe(false);
  });

  it('a group missing from our catalog is an error for that group only', () => {
    const stats = courseMap.get('71204') as Course;
    const catalog = new Map(courseMap);
    catalog.set('71204', { ...stats, sections: stats.sections.filter((s) => s.sectionNumber !== '19') });
    const imp = buildImport(parsed, catalog);
    expect(imp.issues).toEqual([
      { courseId: '71204', group: '19', name: 'Statistics and Computer Usage', semester: 'A', reason: 'unknown-group' },
    ]);
    expect(imp.planned.find((p) => p.courseId === '71204')!.picks).toEqual({ lecture: '18' });
  });

  it('flags groups whose time differs from our data', () => {
    const lang = courseMap.get('63013') as Course;
    const catalog = new Map(courseMap);
    catalog.set('63013', {
      ...lang,
      sections: lang.sections.map((s) =>
        s.sectionNumber === '18' ? { ...s, schedule: [{ ...s.schedule[0]!, startTime: '09:00', endTime: '11:00' }] } : s,
      ),
    });
    const imp = buildImport(parsed, catalog);
    expect(imp.mismatches).toEqual([
      {
        courseId: '63013',
        group: '18',
        name: 'Language and Communication',
        inbar: 'Tue 08:00–10:00',
        times: [{ day: 3, start: 8 * 60, end: 10 * 60 }],
      },
    ]);
    // Группа всё равно выбрана — студент сам решит, чему верить.
    expect(imp.planned.find((p) => p.courseId === '63013')!.picks).toEqual({ lecture: '18' });
  });
});

describe('applyImport', () => {
  const imp = buildImport(parsed, courseMap);
  const existing: Plan = {
    v: 1,
    courses: [
      { courseId: '99002', color: 0, picks: { seminar: '01' } },
      { courseId: '63013', color: 1, picks: { lecture: '19' } },
    ],
    blocks: [{ id: 'b1', label: 'Work', day: 5, startTime: '10:00', endTime: '14:00' }],
  };

  it('replace swaps the courses but keeps personal blocks', () => {
    const next = applyImport(existing, imp, 'replace');
    expect(next.courses.map((c) => c.courseId)).not.toContain('99002');
    expect(next.courses.find((c) => c.courseId === '63013')!.picks).toEqual({ lecture: '18' });
    expect(next.blocks).toEqual(existing.blocks);
  });

  it('add keeps other courses and overwrites the imported ones', () => {
    const next = applyImport(existing, imp, 'add');
    expect(next.courses.map((c) => c.courseId)).toContain('99002');
    expect(next.courses.filter((c) => c.courseId === '63013')).toHaveLength(1);
    expect(next.courses).toHaveLength(18);
    expect(new Set(next.courses.map((c) => c.color)).size).toBeGreaterThan(5);
  });
});
