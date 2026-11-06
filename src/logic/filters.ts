import {
  DAYS,
  SESSION_TYPE_ORDER,
  type Catalog,
  type Course,
  type CourseCategory,
  type Day,
  type Section,
  type Semester,
  type SessionType,
  type Term,
} from '../data/types';
import { overlaps, sectionMeetings, type TimeSpan } from './schedule';
import { toMinutes } from './time';

/**
 * Фильтры курсов — для списка слева и для панели клетки сетки.
 * Поля — как в официальном поиске Бар-Илана (кафедра, название/номер/преподаватель, день, время «от–до»,
 * язык) плюс то, что нужно студенту: факультет, семестр, Оламот / General, тип занятия, здание или онлайн /
 * самостоятельное обучение, кредиты.
 *
 * Правила: пустая группа — без ограничений; внутри группы — «или»; между группами — «и».
 * Признаки группы (тип, место, день и время, слот) должны выполняться у ОДНОЙ группы курса одновременно:
 * «семинар в среду» — это группа-семинар, которая идёт в среду, а не любой семинар + любая встреча в среду.
 */

/** Место группы: номер здания, онлайн (Zoom) или самостоятельное обучение (без расписания). */
export const ONLINE = 'online';
export const SELF = 'self';

export interface CourseFilter {
  /** Название, номер курса или преподаватель. */
  query: string;
  terms: Term[];
  faculties: string[];
  departments: string[];
  categories: CourseCategory[];
  types: SessionType[];
  /** Номера зданий, ONLINE, SELF. */
  places: string[];
  credits: number[];
  languages: string[];
  /** Есть встреча в один из этих дней (как в официальном поиске). */
  days: Day[];
  /** Встреча начинается не раньше / заканчивается не позже (минуты от полуночи). */
  timeFrom: number | null;
  timeTo: number | null;
}

export const EMPTY_FILTER: CourseFilter = {
  query: '',
  terms: [],
  faculties: [],
  departments: [],
  categories: [],
  types: [],
  places: [],
  credits: [],
  languages: [],
  days: [],
  timeFrom: null,
  timeTo: null,
};

/** Группы фильтра, которые в панели клетки сетки не нужны: день и время задаёт сама клетка. */
export type FilterGroup = Exclude<keyof CourseFilter, 'query' | 'timeFrom' | 'timeTo'> | 'time';

/** Сколько групп фильтра включено (без строки поиска). */
export function activeCount(f: CourseFilter, ignore: readonly FilterGroup[] = []): number {
  const groups: FilterGroup[] = ['terms', 'faculties', 'departments', 'categories', 'types', 'places', 'credits', 'languages', 'days'];
  let n = groups.filter((g) => !ignore.includes(g) && (f[g as keyof CourseFilter] as unknown[]).length > 0).length;
  if (!ignore.includes('time') && (f.timeFrom !== null || f.timeTo !== null)) n++;
  return n;
}

/** Поиск по названию, номеру курса (с дефисами или без) и преподавателю. */
export function matchQuery(course: Course, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/[\s-]/g, '');
  if (/^\d+$/.test(digits) && course.courseId.includes(digits)) return true;
  if (course.name.toLowerCase().includes(q)) return true;
  return course.sections.some((s) => s.lecturer?.toLowerCase().includes(q));
}

export function facultyOf(course: Course, catalog?: Pick<Catalog, 'departments'>): string | undefined {
  if (course.facultyId) return course.facultyId;
  if (!course.departmentId) return undefined;
  return catalog?.departments?.find((d) => d.id === course.departmentId)?.facultyId;
}

/** Места группы: здания, ONLINE, SELF (нет расписания). */
export function sectionPlaces(section: Section): Set<string> {
  const places = new Set<string>();
  if (section.schedule.length === 0) places.add(SELF);
  for (const m of section.schedule) {
    if (m.online) places.add(ONLINE);
    else if (m.building) places.add(m.building);
  }
  return places;
}

export interface FilterContext {
  catalog?: Pick<Catalog, 'departments'>;
  /** Панель клетки: только группы со встречей в этом часе этого семестра. */
  slot?: { semester: Semester; span: TimeSpan };
}

function sectionMatches(course: Course, section: Section, f: CourseFilter, ctx: FilterContext): boolean {
  if (f.types.length && !f.types.includes(section.type)) return false;
  if (f.places.length) {
    const places = sectionPlaces(section);
    if (!f.places.some((p) => places.has(p))) return false;
  }
  if (ctx.slot) {
    const { semester, span } = ctx.slot;
    return sectionMeetings(course, section, semester).some((m) =>
      overlaps({ day: m.day, start: toMinutes(m.startTime), end: toMinutes(m.endTime) }, span),
    );
  }
  if (f.days.length || f.timeFrom !== null || f.timeTo !== null) {
    return section.schedule.some(
      (m) =>
        (!f.days.length || f.days.includes(m.day)) &&
        (f.timeFrom === null || toMinutes(m.startTime) >= f.timeFrom) &&
        (f.timeTo === null || toMinutes(m.endTime) <= f.timeTo),
    );
  }
  return true;
}

/** Подходящие группы курса или null, если курс не подходит. */
export function matchFilter(course: Course, f: CourseFilter, ctx: FilterContext = {}): Section[] | null {
  if (!matchQuery(course, f.query)) return null;
  if (f.terms.length && !f.terms.includes(course.term)) return null;
  if (f.departments.length && !(course.departmentId && f.departments.includes(course.departmentId))) return null;
  if (f.faculties.length) {
    const faculty = facultyOf(course, ctx.catalog);
    if (!faculty || !f.faculties.includes(faculty)) return null;
  }
  if (f.categories.length && !f.categories.some((c) => course.categories?.includes(c))) return null;
  if (f.credits.length && (course.credits === null || !f.credits.includes(course.credits))) return null;
  if (f.languages.length && !(course.language && f.languages.includes(course.language))) return null;
  const sections = course.sections.filter((s) => sectionMatches(course, s, f, ctx));
  return sections.length > 0 ? sections : null;
}

export function filterCourses(courses: readonly Course[], f: CourseFilter, ctx: FilterContext = {}): Course[] {
  return courses.filter((c) => matchFilter(c, f, ctx) !== null);
}

export interface FacetOption<T> {
  value: T;
  count: number;
}

export interface Facets {
  terms: FacetOption<Term>[];
  faculties: FacetOption<string>[];
  departments: FacetOption<string>[];
  categories: FacetOption<CourseCategory>[];
  types: FacetOption<SessionType>[];
  places: FacetOption<string>[];
  credits: FacetOption<number>[];
  languages: FacetOption<string>[];
  days: FacetOption<Day>[];
}

function tally<T>(values: Iterable<T>): Map<T, number> {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

const asOptions = <T,>(m: Map<T, number>, order: (a: T, b: T) => number): FacetOption<T>[] =>
  [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => order(a.value, b.value));

/** Что вообще есть в данных (число курсов на каждое значение). Пустая группа в интерфейсе не показывается. */
export function buildFacets(catalog: Pick<Catalog, 'courses' | 'departments' | 'faculties'>): Facets {
  const { courses } = catalog;
  const name = (list: { id: string; name: string }[] | undefined) => (id: string) => list?.find((x) => x.id === id)?.name ?? id;
  const deptName = name(catalog.departments);
  const facName = name(catalog.faculties);
  // Здания: числа по возрастанию, затем онлайн и самостоятельное.
  const placeRank = (p: string) => (p === ONLINE ? 1e9 : p === SELF ? 1e9 + 1 : Number.parseInt(p, 10) || 1e8);
  const perCourse = <T,>(pick: (c: Course) => Iterable<T>) => tally(courses.flatMap((c) => [...new Set(pick(c))]));

  return {
    terms: asOptions(perCourse((c) => [c.term]), (a, b) => ['A', 'B', 'year'].indexOf(a) - ['A', 'B', 'year'].indexOf(b)),
    faculties: asOptions(
      perCourse((c) => {
        const f = facultyOf(c, catalog);
        return f ? [f] : [];
      }),
      (a, b) => facName(a).localeCompare(facName(b)),
    ),
    departments: asOptions(perCourse((c) => (c.departmentId ? [c.departmentId] : [])), (a, b) => deptName(a).localeCompare(deptName(b))),
    categories: asOptions(perCourse((c) => c.categories ?? []), (a, b) => a.localeCompare(b)),
    types: asOptions(
      perCourse((c) => c.sections.map((s) => s.type)),
      (a, b) => SESSION_TYPE_ORDER.indexOf(a) - SESSION_TYPE_ORDER.indexOf(b),
    ),
    places: asOptions(
      perCourse((c) => c.sections.flatMap((s) => [...sectionPlaces(s)])),
      (a, b) => placeRank(a) - placeRank(b) || a.localeCompare(b),
    ),
    credits: asOptions(perCourse((c) => (c.credits === null ? [] : [c.credits])), (a, b) => a - b),
    languages: asOptions(perCourse((c) => (c.language ? [c.language] : [])), (a, b) => a.localeCompare(b)),
    days: asOptions(
      perCourse((c) => c.sections.flatMap((s) => s.schedule.map((m) => m.day))),
      (a, b) => DAYS.indexOf(a) - DAYS.indexOf(b),
    ),
  };
}

/** Переключить значение в группе-списке. */
export function toggleValue<K extends Exclude<keyof CourseFilter, 'query' | 'timeFrom' | 'timeTo'>>(
  f: CourseFilter,
  key: K,
  value: CourseFilter[K][number],
): CourseFilter {
  const list = f[key] as unknown[];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...f, [key]: next };
}

/** Восстановить фильтр из хранилища, отбросив мусор. */
export function sanitizeFilter(v: unknown): CourseFilter {
  const o = (v ?? {}) as Partial<Record<keyof CourseFilter, unknown>>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const numbers = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : []);
  const time = (x: unknown) => (typeof x === 'number' && x >= 0 && x <= 24 * 60 ? x : null);
  return {
    query: typeof o.query === 'string' ? o.query : '',
    terms: strings(o.terms).filter((t): t is Term => t === 'A' || t === 'B' || t === 'year'),
    faculties: strings(o.faculties),
    departments: strings(o.departments),
    categories: strings(o.categories).filter((c): c is CourseCategory => c === 'olamot' || c === 'general'),
    types: strings(o.types).filter((t): t is SessionType => (SESSION_TYPE_ORDER as string[]).includes(t)),
    places: strings(o.places),
    credits: numbers(o.credits),
    languages: strings(o.languages),
    days: numbers(o.days).filter((d): d is Day => DAYS.includes(d as Day)),
    timeFrom: time(o.timeFrom),
    timeTo: time(o.timeTo),
  };
}
