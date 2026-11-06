import type { Occurrence } from './sessions';
import { formatMinutes } from './time';

/**
 * Экспорт в календарь (RFC 5545). Каждая встреча — отдельное событие с реальной датой:
 * так праздники просто не попадают в файл, и не нужны RRULE/EXDATE.
 * Время — местное израильское (TZID=Asia/Jerusalem) с описанием часового пояса.
 */

export interface IcsEvent {
  uid: string;
  /** YYYY-MM-DD */
  date: string;
  /** Минуты от полуночи; без времени — событие на весь день. */
  start?: number;
  end?: number;
  /** Для событий на весь день: последний день (включительно), если их несколько. */
  until?: string;
  summary: string;
  location?: string;
  description?: string;
}

/** Правила перехода на летнее время в Израиле (с 2013 г.). */
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Jerusalem',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:IDT',
  'DTSTART:19700327T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=23,24,25,26,27,28,29;BYDAY=FR',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:IST',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Экранирование текста: \ ; , и переводы строк. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Свернуть строку длиннее 75 байт (UTF-8), продолжение начинается с пробела. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // у продолжения первый байт — пробел
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (iso: string) => iso.replace(/-/g, '');
const compactTime = (min: number) => `${formatMinutes(min).replace(':', '')}00`;

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return next.toISOString().slice(0, 10);
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildIcs(events: readonly IcsEvent[], calendarName: string, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BarSuffer//Unofficial schedule planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Jerusalem',
    ...VTIMEZONE,
  ];
  const dtstamp = stamp(now);
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${dtstamp}`);
    if (e.start !== undefined && e.end !== undefined) {
      lines.push(
        `DTSTART;TZID=Asia/Jerusalem:${compactDate(e.date)}T${compactTime(e.start)}`,
        `DTEND;TZID=Asia/Jerusalem:${compactDate(e.date)}T${compactTime(e.end)}`,
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(e.until ?? e.date))}`);
    }
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Событие календаря из встречи семестра. Тексты (название типа, место) передаёт интерфейс. */
export function occurrenceEvent(
  o: Occurrence,
  text: { summary: string; location?: string; description?: string },
): IcsEvent {
  return {
    uid: `${o.key.replace(/\|/g, '-')}@barsuffer`,
    date: o.date,
    start: o.meeting.start,
    end: o.meeting.end,
    ...text,
  };
}
