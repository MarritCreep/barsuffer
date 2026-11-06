import { useState } from 'react';
import type { Semester } from '../data/types';
import { useI18n, type Translator } from '../i18n/I18n';
import type { Sprint } from '../logic/campus';
import { weeklyCommuteHours, type CreditsSummary } from '../logic/load';
import { MISERY_WEIGHTS, type MiseryResult, type MiseryTitle } from '../logic/misery';
import type { Conflict, PlacedMeeting } from '../logic/schedule';
import { group, hoursText, ltr, span, titleText } from './weekText';

interface Props {
  semester: Semester;
  misery: MiseryResult;
  title: MiseryTitle;
  hours: number;
  credits: CreditsSummary;
  conflicts: Conflict[];
  sprints: Sprint[];
  commuteMinutes: number;
  onCommuteMinutes: (minutes: number) => void;
}

function describe(tr: Translator, m: PlacedMeeting): string {
  const time = span(tr, m.start, m.end);
  if (m.isBlock) return tr.t('stats.yourBlock', { name: m.courseName, time });
  return tr.t('stats.meeting', { name: m.courseName, group: group(tr, m.type, m.sectionNumber), time });
}

export function StatsBar(props: Props) {
  const { semester, misery, title, hours, credits, conflicts, sprints, commuteMinutes } = props;
  const tr = useI18n();
  const { t, day } = tr;
  const [editingCommute, setEditingCommute] = useState(false);
  const level = misery.score >= 70 ? 'high' : misery.score >= 40 ? 'mid' : 'low';
  const commute = weeklyCommuteHours(misery.campusDays, commuteMinutes);
  const named = titleText(tr, title);
  const rows: [string, string, number][] = [
    [t('stats.days'), `${misery.campusDays} × ${MISERY_WEIGHTS.campusDay}`, misery.points.days],
    [t('stats.early'), `${misery.earlyClasses} × ${MISERY_WEIGHTS.earlyClass}`, misery.points.early],
    [t('stats.windows'), `${misery.windowHours} × ${MISERY_WEIGHTS.windowHour}`, misery.points.windows],
    [t('stats.friday'), misery.hasFriday ? t('stats.yes') : t('stats.no'), misery.points.friday],
    [t('stats.late'), `${misery.lateClasses} × ${MISERY_WEIGHTS.lateClass}`, misery.points.late],
  ];

  return (
    <div className="stats">
      <details className="misery" data-level={level}>
        <summary>
          <span className="misery-score" aria-label={t('stats.scoreAria', { score: misery.score })}>
            {misery.score}
            <small>/100</small>
          </span>
          <span className="misery-text">
            <span className="misery-label">{t('stats.label', { term: tr.term(semester) })}</span>
            <span className="misery-title">{named.title}</span>
            <span className="misery-blurb">{named.blurb}</span>
          </span>
        </summary>
        <table className="breakdown">
          <tbody>
            {rows.map(([label, calc, pts]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{ltr(tr, calc)}</td>
                <td className="pts">{pts}</td>
              </tr>
            ))}
            {misery.raw > misery.score && (
              <tr>
                <th scope="row">{t('stats.capped')}</th>
                <td>{t('stats.raw', { n: misery.raw })}</td>
                <td className="pts">{misery.score}</td>
              </tr>
            )}
          </tbody>
        </table>
        {misery.conflictClusters > 0 && <p className="muted small">{t('stats.overlapNote')}</p>}
      </details>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-value">{hoursText(tr, hours)}</span>
          <span className="kpi-label">{t('stats.hours')}</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{tr.num(credits.total)}</span>
          <span className="kpi-label">
            {t('stats.credits', { n: credits.total })}
            {credits.unknown > 0 && t('stats.creditsUnknown', { n: credits.unknown })}
          </span>
        </div>
        <div className={`kpi ${conflicts.length > 0 ? 'kpi-warn' : ''}`}>
          <span className="kpi-value">{conflicts.length}</span>
          <span className="kpi-label">{t('stats.conflicts', { n: conflicts.length })}</span>
        </div>
        <div className="kpi kpi-commute">
          {editingCommute ? (
            <label className="commute-edit">
              <input
                type="number"
                min={0}
                max={300}
                step={5}
                inputMode="numeric"
                defaultValue={commuteMinutes || ''}
                placeholder={t('stats.minPlaceholder')}
                aria-label={t('stats.commuteAria')}
                autoFocus
                onBlur={(e) => {
                  const v = Math.max(0, Math.min(300, Math.round(Number(e.target.value) || 0)));
                  props.onCommuteMinutes(v);
                  setEditingCommute(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              <span className="kpi-label">{t('stats.minOneWay')}</span>
            </label>
          ) : (
            <button
              type="button"
              className="kpi-btn"
              onClick={() => setEditingCommute(true)}
              aria-label={
                commuteMinutes > 0
                  ? t('stats.commuteButton', { h: hoursText(tr, commute), m: commuteMinutes })
                  : t('stats.setCommute')
              }
            >
              <span className="kpi-value">{commuteMinutes > 0 ? hoursText(tr, commute) : '—'}</span>
              <span className="kpi-label">
                {commuteMinutes > 0 ? t('stats.commuteLabel', { m: commuteMinutes }) : t('stats.setCommuteShort')}
              </span>
            </button>
          )}
        </div>
      </div>

      {conflicts.length > 0 && (
        <ul className="conflicts" aria-label={t('stats.conflictsList')}>
          {conflicts.map(({ a, b }) => (
            <li key={`${a.key}|${b.key}`}>
              <strong>{day(a.day)}</strong> {t('stats.overlaps', { a: describe(tr, a), b: describe(tr, b) })}
            </li>
          ))}
        </ul>
      )}

      {sprints.length > 0 && (
        <ul className="sprints" aria-label={t('stats.sprintsList')}>
          {sprints.map((s) => (
            <li key={`${s.from.key}|${s.to.key}`}>
              <strong>{t('week.run')}</strong>{' '}
              {t('stats.sprint', {
                day: day(s.day),
                time: span(tr, s.from.end, s.to.start),
                from: s.from.building ?? '',
                to: s.to.building ?? '',
                walk: s.walk,
                available: s.available,
              })}
            </li>
          ))}
          <li className="muted small">{t('stats.experimental')}</li>
        </ul>
      )}
    </div>
  );
}
