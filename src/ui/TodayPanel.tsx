import { ACADEMIC_CALENDAR } from '../data/calendar';
import type { Semester } from '../data/types';
import { dayJourney, gateLabel } from '../logic/campus';
import type { PlacedMeeting } from '../logic/schedule';
import {
  localDate,
  nextClassAfterToday,
  remainingSessions,
  semesterOn,
  semesterProgress,
  todayInfo,
  type AgendaStatus,
} from '../logic/today';
import { dayWalkMeters, formatDistance, stepsFor } from '../logic/walking';
import { rainWarnings, type HourlyForecast } from '../logic/weather';
import { place, sessionLabel, timeRange } from './format';

interface Props {
  now: Date;
  /** Занятия и блокировки семестра. */
  meetingsFor: (semester: Semester) => PlacedMeeting[];
  forecast: HourlyForecast | null;
  gate: string;
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

/** Полоска «неделя N из M» для текущего или ближайшего семестра. */
function Progress({ now, meetingsFor }: { now: Date; meetingsFor: Props['meetingsFor'] }) {
  const current = semesterOn(now);
  const today = localDate(now);
  const target =
    current ?? ACADEMIC_CALENDAR.find((s) => s.start > today)?.semester ?? ACADEMIC_CALENDAR[ACADEMIC_CALENDAR.length - 1]!.semester;
  const p = semesterProgress(now, target);
  if (!p) return null;
  const left = remainingSessions(now, target, meetingsFor(target));
  const label =
    p.phase === 'during'
      ? `Sem ${target} · week ${p.week} of ${p.totalWeeks} · ${Math.round(p.fraction * 100)}%`
      : p.phase === 'before'
        ? `Sem ${target} starts in ${p.daysUntilStart} ${p.daysUntilStart === 1 ? 'day' : 'days'}`
        : `Sem ${target} is over`;
  return (
    <div className="progress" aria-label="Semester progress">
      <div className="progress-head">
        <span className="progress-label">{label}</span>
        {p.phase !== 'after' && (
          <span className="muted small">
            {left} {left === 1 ? 'class' : 'classes'} left{p.phase === 'during' && ` · ${p.daysLeft} days to go`}
          </span>
        )}
      </div>
      <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fraction * 100)}>
        <span style={{ width: `${p.fraction * 100}%` }} />
      </div>
    </div>
  );
}

export function TodayPanel({ now, meetingsFor, forecast, gate }: Props) {
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
  let extras = null;
  if (info.kind === 'no-semester') {
    body = <p className="today-empty">No classes today — it’s not a teaching period (break or exams).</p>;
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
    const dayClasses = meetingsFor(info.semester).filter((m) => !m.isBlock);
    const meters = dayWalkMeters(dayClasses, info.day, gate || undefined);
    const rain = forecast
      ? rainWarnings(forecast, localDate(now), dayJourney(dayClasses, info.day, gate || undefined), gate ? gateLabel(gate) : undefined)
          .filter((w) => w.at >= nowMin - 30)
      : [];
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
    extras = (
      <>
        {meters > 0 && (
          <p className="today-fact">
            Walking today: ≈{formatDistance(meters)} · {stepsFor(meters).toLocaleString('en-US')} steps
          </p>
        )}
        {rain.length > 0 && (
          <ul className="rain" aria-label="Rain warnings">
            {rain.map((w) => (
              <li key={w.at}>
                <strong>☂ Take an umbrella:</strong> {w.prob}% chance of rain at {w.text}
              </li>
            ))}
          </ul>
        )}
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
      <Progress now={now} meetingsFor={meetingsFor} />
      {body}
      {extras}
      <p className="muted small today-note">
        Holidays and days off are not taken into account yet.
        {forecast && ' Weather: Open-Meteo.com.'}
      </p>
    </div>
  );
}
