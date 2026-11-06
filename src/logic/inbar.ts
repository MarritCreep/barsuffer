import type { Course, Day, Semester } from '../data/types';
import { nextColor, type Picks, type Plan, type PlannedCourse } from './selection';
import { formatMinutes, toMinutes } from './time';

/**
 * Импорт расписания из PDF, который студент сам экспортировал в Инбаре
 * (страница Schedule → All Semesters). Разбор идёт в браузере; файл никуда не отправляется.
 * Имя студента («Logged in as …») не читается и не сохраняется.
 */

/** Текстовый элемент страницы PDF (координаты PDF: y растёт вверх). */
export interface PdfItem {
  str: string;
  x: number;
  y: number;
  w: number;
  font: string;
}

export interface PdfPage {
  height: number;
  items: PdfItem[];
}

export interface ImportedMeeting {
  semester: Semester;
  courseId: string;
  group: string;
  name: string;
  day: Day;
  start: number;
  end: number;
  lecturer?: string;
  building?: string;
  room?: string;
  isLecture: boolean;
}

export interface ImportedUntimed {
  semester: Semester;
  courseId: string;
  group: string;
  name: string;
}

/**
 * Какую распечатку загрузили: Инбар печатает первый семестр, второй или весь год.
 * 'unknown' — на странице не нашлось ни выпадающего списка, ни заголовка семестра.
 */
export type ImportScope = Semester | 'year' | 'unknown';

/**
 * Предупреждение разбора: код и параметры — для перевода в интерфейсе (ключ `import.warn.<code>`),
 * `message` — тот же текст по-английски (для тестов и отладки).
 */
export type InbarWarningCode = 'noHeader' | 'unreadable' | 'noTime' | 'noClasses';

export interface InbarWarning {
  code: InbarWarningCode;
  params?: Record<string, string>;
  message: string;
}

export interface InbarImport {
  meetings: ImportedMeeting[];
  untimed: ImportedUntimed[];
  warnings: InbarWarning[];
  scope: ImportScope;
}

export interface ParseOptions {
  /** Семестр для распечатки без заголовка семестра (студент выбирает сам). */
  fallbackSemester?: Semester;
}

const DAY_NAMES: Record<string, Day> = {
  sunday: 1,
  monday: 2,
  tuesday: 3,
  wednesday: 4,
  thursday: 5,
  friday: 6,
  ראשון: 1,
  שני: 2,
  שלישי: 3,
  רביעי: 4,
  חמישי: 5,
  שישי: 6,
};

const TITLE_RE = /^(.*?)\s*\(\s*(\d{3,7})\s*-\s*(\d{1,3})\s*\)\s*$/;
const TIME_RE = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/;
const ROOM_RE = /^(\d{1,4}[A-Za-z]?)\s*-\s*(\S+)$/;
const CONTINUED_RE = /^(continued|המשך)$/i;
const LECTURE_RE = /^(lecture|שיעור)$/i;

/** Браузерные колонтитулы печати и мусор, который надо пропустить. */
function isNoise(it: PdfItem, page: PdfPage): boolean {
  const s = it.str.trim();
  return (
    it.y > page.height - 30 ||
    it.y < 26 ||
    /^\d{1,2}$/.test(s) || // пагинация «1 2»
    /^https?:\/\//.test(s) ||
    /^logged in as/i.test(s)
  );
}

function semesterHeading(s: string): Semester | null {
  const t = s.trim().toLowerCase();
  if (/^(1st|first) semester$|^סמסטר א'?$/.test(t)) return 'A';
  if (/^(2nd|second) semester$|^סמסטר ב'?$/.test(t)) return 'B';
  return null;
}

function dayOfHeader(s: string): Day | null {
  return DAY_NAMES[s.trim().toLowerCase()] ?? null;
}

function cleanName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/&"\s*/g, '& "')
    .trim();
}

interface Column {
  day: Day | 7;
  center: number;
}

export function parseInbarPdf(pages: readonly PdfPage[], options: ParseOptions = {}): InbarImport {
  const warnings: InbarWarning[] = [];
  const all = pages.flatMap((page, p) =>
    page.items
      .filter((it) => it.str.trim() && !isNoise(it, page))
      .map((it) => ({ ...it, page: p, str: it.str.trim() })),
  );
  // Жирный шрифт — тот, которым набраны названия курсов «… (63013-18)».
  const boldFonts = new Set(all.filter((it) => /\(\s*\d{3,}/.test(it.str)).map((it) => it.font));

  // Порядок чтения: страница, сверху вниз, слева направо.
  all.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  let semester: Semester | null = null;
  let columns: Column[] = [];
  let inAdditional = false;
  let sawAllSemesters = false;
  let usedFallback = false;
  const seenSemesters = new Set<Semester>();
  const streams = new Map<string, { str: string; bold: boolean }[]>();
  const additional: (typeof all)[number][] = [];

  // Заголовок дней: собираем элементы одной строки.
  for (let i = 0; i < all.length; i++) {
    const it = all[i]!;
    if (/^additional lessons$|^שיעורים נוספים$/i.test(it.str)) {
      inAdditional = true;
      continue;
    }
    if (inAdditional) {
      additional.push(it);
      continue;
    }
    if (/^all semesters$|^כל הסמסטרים$/i.test(it.str)) {
      sawAllSemesters = true;
      continue;
    }
    // И выпадающий список («1st Semester»), и заголовок таблицы задают семестр.
    const sem = semesterHeading(it.str);
    if (sem) {
      semester = sem;
      seenSemesters.add(sem);
      continue;
    }
    const headerDay = dayOfHeader(it.str) ?? (/^satu|^saturd|^שבת/i.test(it.str) ? 7 : null);
    if (headerDay !== null) {
      const line = all.filter((o) => o.page === it.page && Math.abs(o.y - it.y) < 1);
      const cols = line
        .map((o) => ({ day: dayOfHeader(o.str) ?? (/^satu|^saturd|^שבת/i.test(o.str) ? (7 as const) : null), center: o.x + o.w / 2 }))
        .filter((c): c is Column => c.day !== null)
        .sort((a, b) => a.center - b.center);
      if (cols.length >= 5) {
        columns = cols;
        if (!semester) {
          // Таблица без заголовка семестра: распечатка одного семестра без подписи.
          semester = options.fallbackSemester ?? 'A';
          usedFallback = true;
        }
        // Пропускаем остальные элементы строки заголовка.
        while (i + 1 < all.length && all[i + 1]!.page === it.page && Math.abs(all[i + 1]!.y - it.y) < 1) i++;
        continue;
      }
    }
    if (!semester || columns.length === 0) continue;

    // Колонка по x: границы — середины между центрами заголовков.
    const first = columns[0]!;
    const second = columns[1]!;
    const leftEdge = first.center - (second.center - first.center) / 2;
    if (it.x < leftEdge) continue; // колонка времени слева
    let col = columns[columns.length - 1]!;
    for (let c = 0; c < columns.length - 1; c++) {
      const boundary = (columns[c]!.center + columns[c + 1]!.center) / 2;
      if (it.x < boundary) {
        col = columns[c]!;
        break;
      }
    }
    if (col.day === 7) continue; // суббота
    const key = `${semester}|${col.day}`;
    const list = streams.get(key) ?? [];
    list.push({ str: it.str, bold: boldFonts.has(it.font) });
    streams.set(key, list);
  }

  if (columns.length === 0) {
    warnings.push({
      code: 'noHeader',
      message: 'Could not find the weekday header. Export the schedule from Inbar in English (“All Semesters”).',
    });
  }

  // Разбор каждой колонки: жирный заголовок, затем время или «Continued», затем детали.
  const meetings: ImportedMeeting[] = [];
  for (const [key, items] of streams) {
    const [sem, dayStr] = key.split('|') as [Semester, string];
    const day = Number(dayStr) as Day;
    let i = 0;
    while (i < items.length) {
      if (!items[i]!.bold) {
        i++;
        continue;
      }
      const title: string[] = [];
      while (i < items.length && items[i]!.bold) title.push(items[i++]!.str);
      const details: string[] = [];
      while (i < items.length && !items[i]!.bold) details.push(items[i++]!.str);

      const t = TITLE_RE.exec(cleanName(title.join(' ')));
      if (!t) {
        const text = cleanName(title.join(' ')).slice(0, 60);
        warnings.push({ code: 'unreadable', params: { text }, message: `Skipped an unreadable block: “${text}”` });
        continue;
      }
      const first = details[0] ?? '';
      if (CONTINUED_RE.test(first)) continue;
      const time = TIME_RE.exec(first);
      if (!time) {
        const id = `${t[2]}-${t[3]}`;
        warnings.push({ code: 'noTime', params: { id }, message: `No time found for ${id}.` });
        continue;
      }
      const rest = details.slice(1);
      const roomIndex = rest.findIndex((s) => ROOM_RE.test(s));
      const lecturerParts = (roomIndex === -1 ? rest : rest.slice(0, roomIndex)).filter((s) => !LECTURE_RE.test(s));
      const room = roomIndex === -1 ? null : ROOM_RE.exec(rest[roomIndex]!);
      meetings.push({
        semester: sem,
        courseId: t[2]!,
        group: t[3]!.padStart(2, '0'),
        name: cleanName(t[1]!),
        day,
        start: toMinutes(time[1]!.padStart(5, '0')),
        end: toMinutes(time[2]!.padStart(5, '0')),
        lecturer: lecturerParts.length ? lecturerParts.join(' ') : undefined,
        building: room?.[1],
        room: room?.[2],
        isLecture: rest.some((s) => LECTURE_RE.test(s)),
      });
    }
  }
  meetings.sort((a, b) => a.semester.localeCompare(b.semester) || a.day - b.day || a.start - b.start);

  // «Additional Lessons»: строки «161053-01  Название  Semester A».
  const untimed: ImportedUntimed[] = [];
  const lines = new Map<string, (typeof all)[number][]>();
  for (const it of additional) {
    const k = `${it.page}|${Math.round(it.y)}`;
    lines.set(k, [...(lines.get(k) ?? []), it]);
  }
  for (const line of lines.values()) {
    const parts = line.sort((a, b) => a.x - b.x).map((o) => o.str);
    const id = /^(\d{3,7})-(\d{1,3})$/.exec(parts[0] ?? '');
    const semPart = parts[parts.length - 1] ?? '';
    const semMatch = /semester\s+([AB])|סמסטר\s+([אב])/i.exec(semPart);
    if (!id || !semMatch) continue;
    const letter = (semMatch[1] ?? (semMatch[2] === 'א' ? 'A' : 'B')).toUpperCase() as Semester;
    untimed.push({
      semester: letter,
      courseId: id[1]!,
      group: id[2]!.padStart(2, '0'),
      name: cleanName(parts.slice(1, -1).join(' ')),
    });
  }

  if (meetings.length === 0 && untimed.length === 0 && warnings.length === 0) {
    warnings.push({ code: 'noClasses', message: 'No classes found in this PDF.' });
  }

  let scope: ImportScope;
  if (sawAllSemesters || seenSemesters.size > 1) scope = 'year';
  else if (usedFallback) scope = options.fallbackSemester ?? 'unknown';
  else scope = [...seenSemesters][0] ?? 'unknown';

  // В распечатке одного семестра «Additional Lessons» другого семестра не нужны.
  const keptUntimed = scope === 'A' || scope === 'B' ? untimed.filter((u) => u.semester === scope) : untimed;
  return { meetings, untimed: keptUntimed, warnings, scope };
}

// ---------- Перенос в план ----------

/** Почему курс или группа из Инбара не попали в план. */
export interface ImportIssue {
  courseId: string;
  group?: string;
  name: string;
  semester: Semester;
  reason: 'unknown-course' | 'unknown-group';
}

/** Группа найдена, но её время у нас записано иначе — возможно, данные устарели. */
export interface ImportMismatch {
  courseId: string;
  group: string;
  name: string;
  /** Время по Инбару по-английски («Tue 08:00–10:00»); интерфейс собирает текст из `times`. */
  inbar: string;
  times: { day: Day; start: number; end: number }[];
}

export interface ImportPlan {
  planned: { courseId: string; picks: Picks }[];
  issues: ImportIssue[];
  mismatches: ImportMismatch[];
}

const DAY_SHORT: Record<Day, string> = { 1: 'Sun', 2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri' };

/**
 * Сопоставляет расписание из Инбара с каталогом BarSuffer. Курсы и группы, которых
 * в каталоге нет, не создаются — они возвращаются как ошибки, остальное добавляется.
 */
export function buildImport(data: InbarImport, catalog: ReadonlyMap<string, Course>): ImportPlan {
  const groups = new Map<string, { courseId: string; group: string; name: string; semester: Semester; meetings: ImportedMeeting[] }>();
  const add = (courseId: string, group: string, name: string, semester: Semester) => {
    const key = `${courseId}-${group}`;
    const g = groups.get(key) ?? { courseId, group, name, semester, meetings: [] };
    groups.set(key, g);
    return g;
  };
  for (const m of data.meetings) add(m.courseId, m.group, m.name, m.semester).meetings.push(m);
  for (const u of data.untimed) add(u.courseId, u.group, u.name, u.semester);

  const picksByCourse = new Map<string, Picks>();
  const issues: ImportIssue[] = [];
  const mismatches: ImportMismatch[] = [];
  const reported = new Set<string>();

  for (const g of groups.values()) {
    const course = catalog.get(g.courseId);
    if (!course) {
      if (!reported.has(g.courseId)) {
        issues.push({ courseId: g.courseId, name: g.name, semester: g.semester, reason: 'unknown-course' });
        reported.add(g.courseId);
      }
      continue;
    }
    const section = course.sections.find((s) => s.sectionNumber === g.group);
    if (!section) {
      issues.push({ courseId: g.courseId, group: g.group, name: course.name, semester: g.semester, reason: 'unknown-group' });
      continue;
    }
    const picks = picksByCourse.get(g.courseId) ?? {};
    if (picks[section.type] === undefined) picks[section.type] = section.sectionNumber;
    picksByCourse.set(g.courseId, picks);

    // Сверка времени: каждая встреча из Инбара должна быть и у нас.
    const ours = section.schedule.map((s) => `${s.day}|${toMinutes(s.startTime)}|${toMinutes(s.endTime)}`);
    const differs = g.meetings.some((m) => !ours.includes(`${m.day}|${m.start}|${m.end}`));
    if (differs) {
      mismatches.push({
        courseId: g.courseId,
        group: g.group,
        name: course.name,
        inbar: g.meetings.map((m) => `${DAY_SHORT[m.day]} ${formatMinutes(m.start)}–${formatMinutes(m.end)}`).join(', '),
        times: g.meetings.map((m) => ({ day: m.day, start: m.start, end: m.end })),
      });
    }
  }

  return {
    planned: [...picksByCourse].map(([courseId, picks]) => ({ courseId, picks })),
    issues,
    mismatches,
  };
}

/**
 * Применить импорт к плану (блокировки не трогаются).
 * «Заменить» убирает курсы только того периода, что был в распечатке: PDF первого семестра
 * не трогает курсы второго. «Добавить» оставляет всё, кроме курсов из импорта.
 */
export function applyImport(
  plan: Plan,
  imp: ImportPlan,
  mode: 'replace' | 'add',
  scope: ImportScope = 'year',
  catalog?: ReadonlyMap<string, Course>,
): Plan {
  const importedIds = new Set(imp.planned.map((p) => p.courseId));
  const inScope = (courseId: string) => {
    if (scope !== 'A' && scope !== 'B') return true;
    const term = catalog?.get(courseId)?.term;
    return term === undefined || term === 'year' || term === scope;
  };
  let next: Plan = {
    ...plan,
    courses: plan.courses.filter(
      (c) => !importedIds.has(c.courseId) && (mode === 'add' || !inScope(c.courseId)),
    ),
  };
  for (const p of imp.planned) {
    const pc: PlannedCourse = { courseId: p.courseId, color: nextColor(next), picks: p.picks };
    next = { ...next, courses: [...next.courses, pc] };
  }
  return next;
}

