import { ACADEMIC_CALENDAR } from '../data/calendar';
import type { Semester } from '../data/types';
import type { PlacedMeeting } from '../logic/schedule';
import { localDate, nextClassAfterToday, todayInfo, type AgendaStatus } from '../logic/today';
import { place, sessionLabel, timeRange } from './format';

interface Props {
  now: Date;
  /** Занятия и блокировки семестра. */
  meetingsFor: (semester: Semester) => PlacedMeeting[];
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function inMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const STATUS_LABEL: Record<AgendaStatus, string> = { done: 'Done', now: 'Now', next: 'Next', later: '' };

export function TodayPanel({ now, meetingsFor }: Props) {
  const info = todayInfo(now, meetingsFor);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = nextClassAfterToday(now, meetingsFor);

  const nextLine = next && (
    <p className="today-next">
      Next class: <strong>{SHORT_FMT.format(next.date)}</strong> {timeRange(next.meeting.start, next.meeting.end)} —{' '}
      {next.meeting.courseName}
    </p>
  );

  let body;
  if (info.kind === 'no-semester') {
    const upcoming = ACADEMIC_CALENDAR.find((s) => s.start > localDate(now));
    body = (
      <>
        <p className="today-empty">No classes today — it’s not a teaching period (break or exams).</p>
        {upcoming && (
          <p className="muted small">
            Semester {upcoming.semester} starts on {SHORT_FMT.format(new Date(`${upcoming.start}T00:00`))}.
          </p>
        )}
      </>
    );
  } else if (info.kind === 'shabbat') {
    body = (
      <>
        <p className="today-empty">Shabbat — no classes today.</p>
        {nextLine}
      </>
    );
  } else {
    const classes = info.items.filter((i) => !i.meeting.isBlock);
    const allDone = classes.length > 0 && classes.every((i) => i.status === 'done');
    body = (
      <>
        {classes.length === 0 && <p className="today-empty">No classes today. Enjoy!</p>}
        {info.items.length > 0 && (
          <ol className="agenda">
            {info.items.map(({ meeting: m, status }) => {
              const where = place(m.building, m.room);
              return (
                <li key={m.key} className={`agenda-item ${status} ${m.isBlock ? 'busy' : `c${m.color}`}`}>
                  <span className="agenda-time">{timeRange(m.start, m.end)}</span>
                  <span className="agenda-main">
                    <span className="result-name">{m.courseName}</span>
                    <span className="result-meta">
                      {m.isBlock ? 'Blocked time' : sessionLabel(m.type, m.sectionNumber)}
                      {where && ` · ${where}`}
                    </span>
                  </span>
                  <span className="agenda-status">
                    {status === 'now' && `Now · ${inMinutes(m.end - nowMin)} left`}
                    {status === 'next' && `In ${inMinutes(m.start - nowMin)}`}
                    {status === 'done' && STATUS_LABEL.done}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {allDone && <p className="today-empty">Done for today!</p>}
        {(classes.length === 0 || allDone) && nextLine}
      </>
    );
  }

  return (
    <div className="block today">
      <div className="block-head">
        <h2>Today</h2>
        <span className="muted small">
          {DATE_FMT.format(now)}
          {info.kind !== 'no-semester' && ` · Sem ${info.semester}`}
        </span>
      </div>
      {body}
      <p className="muted small today-note">Holidays and days off are not taken into account yet.</p>
    </div>
  );
}
