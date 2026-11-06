import { useState } from 'react';
import { ACADEMIC_CALENDAR, type NoClassPeriod } from '../data/calendar';
import type { Semester } from '../data/types';
import { useI18n, type T } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import { heatWarning } from '../logic/heat';
import { upcomingPeriods } from '../logic/holidays';
import { wakeFor, weekWake } from '../logic/wake';
import type { WakePrefs } from '../state/tools';
import { dayJourney } from '../logic/campus';
import type { PlacedMeeting } from '../logic/schedule';
import { formatMinutes } from '../logic/time';
import {
  localDate,
  nextClassAfterToday,
  remainingSessions,
  semesterOn,
  semesterProgress,
  todayInfo,
} from '../logic/today';
import { dayWalkMeters } from '../logic/walking';
import { rainWarnings, type HourlyForecast } from '../logic/weather';
import { distanceText, spotName, stepsText } from './CampusMap';
import { place, timeRange } from './format';

interface Props {
  now: Date;
  /** Занятия и блокировки семестра. */
  meetingsFor: (semester: Semester) => PlacedMeeting[];
  forecast: HourlyForecast | null;
  gate: string;
  commuteMinutes: number;
  wake: WakePrefs;
  onWake: (w: WakePrefs) => void;
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
const SHORT_OPTS: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

function inMinutes(t: T, total: number): string {
  if (total < 60) return t('today.dur.min', { n: total });
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? t('today.dur.h', { h }) : t('today.dur.hm', { h, m });
}

/** Полоска «неделя N из M» для текущего или ближайшего семестра. */
function Progress({ now, meetingsFor }: { now: Date; meetingsFor: Props['meetingsFor'] }) {
  const { t, term } = useI18n();
  const current = semesterOn(now);
  const today = localDate(now);
  const target =
    current ?? ACADEMIC_CALENDAR.find((s) => s.start > today)?.semester ?? ACADEMIC_CALENDAR[ACADEMIC_CALENDAR.length - 1]!.semester;
  const p = semesterProgress(now, target);
  if (!p) return null;
  const left = remainingSessions(now, target, meetingsFor(target));
  const sem = term(target);
  const label =
    p.phase === 'during'
      ? t('today.during', { sem, week: p.week, total: p.totalWeeks, pct: Math.round(p.fraction * 100) })
      : p.phase === 'before'
        ? t('today.before', { sem, n: p.daysUntilStart })
        : t('today.after', { sem });
  return (
    <div className="progress" aria-label={t('today.progress')}>
      <div className="progress-head">
        <span className="progress-label">{label}</span>
        {p.phase !== 'after' && (
          <span className="muted small">
            {t('today.left', { n: left })}
            {p.phase === 'during' && ` · ${t('today.toGo', { n: p.daysLeft })}`}
          </span>
        )}
      </div>
      <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fraction * 100)}>
        <span style={{ width: `${p.fraction * 100}%` }} />
      </div>
    </div>
  );
}

export function TodayPanel({ now, meetingsFor, forecast, gate, commuteMinutes, wake, onWake }: Props) {
  const tr = useI18n();
  const { t, term, type, date } = tr;
  const info = todayInfo(now, meetingsFor);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = nextClassAfterToday(now, meetingsFor);

  const nextLine = next && (
    <p className="today-next">
      {t('today.nextClass')} <strong>{date(next.date, SHORT_OPTS)}</strong> {timeRange(next.meeting.start, next.meeting.end)} —{' '}
      {next.meeting.courseName}
    </p>
  );

  let body;
  let extras = null;
  if (info.kind === 'no-semester') {
    body = <p className="today-empty">{t('today.noSemester')}</p>;
  } else if (info.kind === 'holiday') {
    body = (
      <>
        <p className="today-empty">{t('todayx.holiday', { holiday: t(`holiday.${info.holiday.id}` as MessageKey) })}</p>
        {nextLine}
      </>
    );
  } else if (info.kind === 'shabbat') {
    body = (
      <>
        <p className="today-empty">{t('today.shabbat')}</p>
        {nextLine}
      </>
    );
  } else {
    const classes = info.items.filter((i) => !i.meeting.isBlock && i.status !== 'cancelled');
    const allDone = classes.length > 0 && classes.every((i) => i.status === 'done');
    const dayClasses = meetingsFor(info.semester).filter((m) => !m.isBlock);
    const meters = dayWalkMeters(dayClasses, info.day, gate || undefined);
    const rain = forecast
      ? rainWarnings(forecast, localDate(now), dayJourney(dayClasses, info.day, gate || undefined), gate || undefined)
          .filter((w) => w.at >= nowMin - 30)
      : [];
    body = (
      <>
        {info.holiday && <p className="today-fact">{t('todayx.partial', { holiday: t(`holiday.${info.holiday.id}` as MessageKey) })}</p>}
        {classes.length === 0 && <p className="today-empty">{t('today.free')}</p>}
        {info.items.length > 0 && (
          <ol className="agenda">
            {info.items.map(({ meeting: m, status, shortened }) => {
              const where = place(m.building, m.room);
              return (
                <li key={m.key} className={`agenda-item ${status} ${m.isBlock ? 'busy' : `c${m.color}`}`}>
                  <span className="agenda-time">{timeRange(m.start, m.end)}</span>
                  <span className="agenda-main">
                    <span className="result-name">{m.courseName}</span>
                    <span className="result-meta">
                      {m.isBlock ? t('today.blocked') : `${type(m.type)} ${m.sectionNumber}`}
                      {where && ` · ${where}`}
                    </span>
                  </span>
                  <span className="agenda-status">
                    {status === 'now' && t('today.nowLeft', { d: inMinutes(t, m.end - nowMin) })}
                    {status === 'next' && t('today.in', { d: inMinutes(t, m.start - nowMin) })}
                    {status === 'done' && t('today.done')}
                    {status === 'cancelled' && t('todayx.cancelled')}
                    {shortened && status !== 'cancelled' && ` · ${t('todayx.shortened')}`}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {allDone && <p className="today-empty">{t('today.allDone')}</p>}
        {(classes.length === 0 || allDone) && nextLine}
      </>
    );
    const campus = dayClasses.filter((m) => m.day === info.day);
    const heat = forecast && campus.length > 0
      ? heatWarning(
          forecast,
          localDate(now),
          { start: Math.min(...campus.map((m) => m.start)), end: Math.max(...campus.map((m) => m.end)) },
          Math.round(meters / 70),
        )
      : null;
    extras = (
      <>
        {heat && (
          <p className={`heat-warn ${heat.level}`} role="note">
            {t(heat.level === 'extreme' ? 'todayx.extreme' : 'todayx.hot', { t: heat.max, time: formatMinutes(heat.at), walk: heat.walkMinutes })}
          </p>
        )}
        {meters > 0 && (
          <p className="today-fact">
            {t('today.walking', { dist: distanceText(tr, meters), steps: stepsText(tr, meters) })}
          </p>
        )}
        {rain.length > 0 && (
          <ul className="rain" aria-label={t('today.rainList')}>
            {rain.map((w) => (
              <li key={w.at}>
                <strong>{t('today.umbrella')}</strong>{' '}
                {t('today.rain', {
                  prob: w.prob,
                  time: formatMinutes(w.at),
                  from: spotName(tr, w.from),
                  to: spotName(tr, w.to),
                  walk: w.walk,
                })}
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
        <h2>{t('today.title')}</h2>
        <span className="muted small">
          {date(now, DATE_OPTS)}
          {info.kind !== 'no-semester' && ` · ${term(info.semester)}`}
        </span>
      </div>
      <Progress now={now} meetingsFor={meetingsFor} />
      {body}
      {extras}
      <Upcoming now={now} />
      <Alarm now={now} meetingsFor={meetingsFor} commuteMinutes={commuteMinutes} wake={wake} onWake={onWake} />
      <p className="muted small today-note">
        {t('today.holidays')}
        {forecast && ` ${t('today.weather')}`}
      </p>
    </div>
  );
}

/** Праздники в ближайшие две недели (по официальному календарю). */
function Upcoming({ now }: { now: Date }) {
  const { t, date } = useI18n();
  const today = localDate(now);
  const list = upcomingPeriods(today, 14).filter((p) => p.from > today || p.to > today);
  if (list.length === 0) return null;
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  const line = (p: NoClassPeriod) => {
    const holiday = t(`holiday.${p.id}` as MessageKey);
    return p.from === p.to
      ? t('todayx.oneDay', { holiday, date: date(p.from, opts) })
      : t('todayx.range', { holiday, from: date(p.from, opts), to: date(p.to, opts) });
  };
  return (
    <div className="today-upcoming">
      <span className="field-label">{t('todayx.upcoming')}</span>
      <ul className="small">
        {list.map((p) => (
          <li key={p.id}>🎉 {line(p)}</li>
        ))}
      </ul>
    </div>
  );
}

/** Будильник: ближайший учебный день (сегодня, если пара ещё впереди) и неделя целиком. */
function Alarm({
  now,
  meetingsFor,
  commuteMinutes,
  wake,
  onWake,
}: {
  now: Date;
  meetingsFor: Props['meetingsFor'];
  commuteMinutes: number;
  wake: WakePrefs;
  onWake: (w: WakePrefs) => void;
}) {
  const { t, day, date } = useI18n();
  const [open, setOpen] = useState(false);
  const opts = { commuteMinutes, prepMinutes: wake.prepMinutes, sleepHours: wake.sleepHours };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const info = todayInfo(now, meetingsFor);

  // Сегодня — если первая пара ещё не началась; иначе ближайший следующий день с парами.
  let target: { when: string; plan: NonNullable<ReturnType<typeof wakeFor>> } | null = null;
  if (info.kind === 'day') {
    const todays = info.items.filter((i) => !i.meeting.isBlock && i.status !== 'cancelled').map((i) => i.meeting);
    const plan = wakeFor(todays, info.day, opts);
    if (plan && plan.firstClass > nowMin) target = { when: t('todayx.today'), plan };
  }
  if (!target) {
    const next = nextClassAfterToday(now, meetingsFor);
    if (next) {
      const sem = semesterOn(next.date);
      const d = next.date.getDay() + 1;
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const isTomorrow = next.date.getTime() === tomorrow.getTime();
      const list = sem ? meetingsFor(sem).filter((m) => !m.isBlock && m.day === d && m.start >= next.meeting.start) : [];
      const plan = wakeFor(list, d as 1, opts);
      if (plan) target = { when: isTomorrow ? t('todayx.tomorrow') : date(next.date, { weekday: 'long', day: 'numeric', month: 'short' }), plan };
    }
  }

  const sem = semesterOn(now) ?? ACADEMIC_CALENDAR.find((s) => s.start > localDate(now))?.semester ?? 'A';
  const week = weekWake(meetingsFor(sem).filter((m) => !m.isBlock), opts);

  return (
    <div className="today-alarm">
      <span className="field-label">⏰ {t('todayx.alarm')}</span>
      {target ? (
        <p className="small">
          {t('todayx.wake', {
            when: target.when,
            wake: formatMinutes(target.plan.wake),
            leave: formatMinutes(target.plan.leave),
            first: formatMinutes(target.plan.firstClass),
          })}{' '}
          <span className="muted">{t(`todayx.mood.${target.plan.mood}` as MessageKey)}</span>
        </p>
      ) : (
        <p className="small muted">{t('todayx.noAlarm')}</p>
      )}
      <details className="tool-details" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="small">{t('todayx.week')}</summary>
        {week.length > 0 && (
          <ul className="alarm-week small">
            {week.map((w) => (
              <li key={w.day}>
                <strong>{day(w.day)}</strong> <span dir="ltr">{formatMinutes(w.wake)}</span>
                <span className="muted"> · {t('todayx.bed', { bed: formatMinutes(w.bedtime), h: wake.sleepHours })}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="alarm-prefs">
          <label className="field">
            <span className="field-label">{t('todayx.prep')}</span>
            <input
              type="number"
              min={0}
              max={240}
              step={5}
              value={wake.prepMinutes}
              onChange={(e) => onWake({ ...wake, prepMinutes: Math.max(0, Math.min(240, Number(e.target.value) || 0)) })}
            />
          </label>
          <label className="field">
            <span className="field-label">{t('todayx.sleep')}</span>
            <input
              type="number"
              min={3}
              max={12}
              step={0.5}
              value={wake.sleepHours}
              onChange={(e) => onWake({ ...wake, sleepHours: Math.max(3, Math.min(12, Number(e.target.value) || 8)) })}
            />
          </label>
        </div>
        <p className="muted small">{t('todayx.commute', { n: commuteMinutes })}</p>
      </details>
    </div>
  );
}