import type { Course, Day, Semester, SessionType } from '../data/types';
import type { PersonalBlock, Picks, Plan, PlannedCourse } from './selection';

/**
 * Ссылка другу: расписание целиком в адресе (#friend=…), без сервера.
 * В ссылку попадают только номера курсов и групп, имя (если указано) и занятое время блокировок —
 * без подписей блокировок (там может быть что-то личное). Скрытые курсы не передаются.
 */

export const SHARE_PARAM = 'friend';
const NAME_MAX = 30;

const TYPE_CODE: Record<SessionType, string> = {
  lecture: 'l',
  exercise: 'e',
  lab: 'b',
  seminar: 's',
  proseminar: 'p',
  workshop: 'w',
  guidance: 'g',
  other: 'o',
};
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODE).map(([k, v]) => [v, k])) as Record<string, SessionType>;

/** [курс, цвет, "l18.e20"] */
type WireCourse = [string, number, string];
/** [день, "0800", "1000", семестр?] */
type WireBlock = [number, string, string] | [number, string, string, Semester];
interface Wire {
  v: 1;
  n?: string;
  c: WireCourse[];
  b?: WireBlock[];
}

export interface SharedPlan {
  name: string;
  plan: Plan;
  /** Курсы из ссылки, которых нет в нашем каталоге. */
  dropped: string[];
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const packTime = (t: string) => t.replace(':', '');
const unpackTime = (t: string) => `${t.slice(0, 2)}:${t.slice(2, 4)}`;

export function encodeShare(plan: Plan, name = ''): string {
  const wire: Wire = {
    v: 1,
    c: plan.courses
      .filter((c) => !c.hidden)
      .map((c): WireCourse => [
        c.courseId,
        c.color,
        Object.entries(c.picks)
          .filter(([, num]) => num !== undefined)
          .map(([type, num]) => `${TYPE_CODE[type as SessionType]}${num}`)
          .join('.'),
      ]),
  };
  const trimmed = name.trim().slice(0, NAME_MAX);
  if (trimmed) wire.n = trimmed;
  const blocks = plan.blocks ?? [];
  if (blocks.length > 0) {
    wire.b = blocks.map((b): WireBlock =>
      b.semester ? [b.day, packTime(b.startTime), packTime(b.endTime), b.semester] : [b.day, packTime(b.startTime), packTime(b.endTime)],
    );
  }
  return toBase64Url(JSON.stringify(wire));
}

export function shareUrl(base: string, plan: Plan, name = ''): string {
  return `${base.split('#')[0]}#${SHARE_PARAM}=${encodeShare(plan, name)}`;
}

/** Достать полезную нагрузку из хеша адреса (#friend=…) или null. */
export function payloadFromHash(hash: string): string | null {
  const m = new RegExp(`[#&]${SHARE_PARAM}=([A-Za-z0-9_-]+)`).exec(hash);
  return m ? m[1]! : null;
}

const isTime = (t: unknown): t is string => typeof t === 'string' && /^\d{4}$/.test(t);

export function decodeShare(payload: string, catalog: ReadonlyMap<string, Course>): SharedPlan | null {
  let wire: Wire;
  try {
    wire = JSON.parse(fromBase64Url(payload)) as Wire;
  } catch {
    return null;
  }
  if (typeof wire !== 'object' || wire === null || wire.v !== 1 || !Array.isArray(wire.c)) return null;

  const courses: PlannedCourse[] = [];
  const dropped: string[] = [];
  for (const item of wire.c) {
    if (!Array.isArray(item) || typeof item[0] !== 'string') continue;
    const [courseId, color, picksText] = item;
    const course = catalog.get(courseId);
    if (!course) {
      dropped.push(courseId);
      continue;
    }
    const picks: Picks = {};
    for (const part of String(picksText ?? '').split('.')) {
      const type = CODE_TYPE[part.charAt(0)];
      const num = part.slice(1);
      // Только группы, которые на самом деле есть у курса.
      if (type && course.sections.some((s) => s.type === type && s.sectionNumber === num)) picks[type] = num;
    }
    if (courses.some((c) => c.courseId === courseId)) continue;
    courses.push({ courseId, color: typeof color === 'number' ? color : courses.length, picks });
  }

  const blocks: PersonalBlock[] = [];
  for (const [i, b] of (Array.isArray(wire.b) ? wire.b : []).entries()) {
    if (!Array.isArray(b)) continue;
    const [day, start, end, semester] = b;
    if (typeof day !== 'number' || day < 1 || day > 6 || !isTime(start) || !isTime(end) || start >= end) continue;
    blocks.push({
      id: `f${i}`,
      label: '',
      day: day as Day,
      startTime: unpackTime(start),
      endTime: unpackTime(end),
      ...(semester === 'A' || semester === 'B' ? { semester } : {}),
    });
  }

  return {
    name: typeof wire.n === 'string' ? wire.n.slice(0, NAME_MAX) : '',
    plan: { v: 1, courses, ...(blocks.length > 0 ? { blocks } : {}) },
    dropped,
  };
}
