import { useState } from 'react';
import { DAY_LABEL, type Semester } from '../data/types';
import type { Sprint } from '../logic/campus';
import { weeklyCommuteHours, type CreditsSummary } from '../logic/load';
import { MISERY_WEIGHTS, type MiseryResult, type MiseryTitle } from '../logic/misery';
import type { Conflict, PlacedMeeting } from '../logic/schedule';
import { formatHours, sessionLabel, timeRange } from './format';

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

function describe(m: PlacedMeeting): string {
  if (m.isBlock) return `your block “${m.courseName}” (${timeRange(m.start, m.end)})`;
  return `${m.courseName} (${sessionLabel(m.type, m.sectionNumber)}, ${timeRange(m.start, m.end)})`;
}

export function StatsBar(props: Props) {
  const { semester, misery, title, hours, credits, conflicts, sprints, commuteMinutes } = props;
  const [editingCommute, setEditingCommute] = useState(false);
  const level = misery.score >= 70 ? 'high' : misery.score >= 40 ? 'mid' : 'low';
  const commute = weeklyCommuteHours(misery.campusDays, commuteMinutes);
  const rows: [string, string, number][] = [
    ['Days on campus', `${misery.campusDays} × ${MISERY_WEIGHTS.campusDay}`, misery.points.days],
    ['Classes before 09:00', `${misery.earlyClasses} × ${MISERY_WEIGHTS.earlyClass}`, misery.points.early],
    ['Window hours', `${misery.windowHours} × ${MISERY_WEIGHTS.windowHour}`, misery.points.windows],
    ['Friday classes', misery.hasFriday ? 'yes' : 'no', misery.points.friday],
    ['Classes ending after 18:00', `${misery.lateClasses} × ${MISERY_WEIGHTS.lateClass}`, misery.points.late],
  ];

  return (
    <div className="stats">
      <details className="misery" data-level={level}>
        <summary>
          <span className="misery-score" aria-label={`Suffering index ${misery.score} of 100`}>
            {misery.score}
            <small>/100</small>
          </span>
          <span className="misery-text">
            <span className="misery-label">Suffering index · Sem {semester}</span>
            <span className="misery-title">{title.title}</span>
            <span className="misery-blurb">{title.blurb}</span>
          </span>
        </summary>
        <table className="breakdown">
          <tbody>
            {rows.map(([label, calc, pts]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{calc}</td>
                <td className="pts">{pts}</td>
              </tr>
            ))}
            {misery.raw > misery.score && (
              <tr>
                <th scope="row">Capped at 100</th>
                <td>raw {misery.raw}</td>
                <td className="pts">{misery.score}</td>
              </tr>
            )}
          </tbody>
        </table>
        {misery.conflictClusters > 0 && (
          <p className="muted small">Overlapping classes count once — the heaviest one.</p>
        )}
      </details>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-value">{formatHours(hours)}</span>
          <span className="kpi-label">academic hrs / week</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{credits.total}</span>
          <span className="kpi-label">
            credits, whole year{credits.unknown > 0 && ` (+${credits.unknown} unknown)`}
          </span>
        </div>
        <div className={`kpi ${conflicts.length > 0 ? 'kpi-warn' : ''}`}>
          <span className="kpi-value">{conflicts.length}</span>
          <span className="kpi-label">{conflicts.length === 1 ? 'conflict' : 'conflicts'}</span>
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
                placeholder="min"
                aria-label="Commute one way, minutes"
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
              <span className="kpi-label">min one way</span>
            </label>
          ) : (
            <button
              type="button"
              className="kpi-btn"
              onClick={() => setEditingCommute(true)}
              aria-label={
                commuteMinutes > 0
                  ? `${formatHours(commute)} hours on the road per week, ${commuteMinutes} minutes one way. Change`
                  : 'Set your commute time'
              }
            >
              <span className="kpi-value">{commuteMinutes > 0 ? formatHours(commute) : '—'}</span>
              <span className="kpi-label">
                {commuteMinutes > 0 ? `hrs on the road / week (${commuteMinutes} min one way)` : 'set commute time'}
              </span>
            </button>
          )}
        </div>
      </div>

      {conflicts.length > 0 && (
        <ul className="conflicts" aria-label="Conflicts">
          {conflicts.map(({ a, b }) => (
            <li key={`${a.key}|${b.key}`}>
              <strong>{DAY_LABEL[a.day]}</strong> {describe(a)} overlaps {describe(b)}
            </li>
          ))}
        </ul>
      )}

      {sprints.length > 0 && (
        <ul className="sprints" aria-label="Tight walks between classes">
          {sprints.map((s) => (
            <li key={`${s.from.key}|${s.to.key}`}>
              <strong>Run!</strong> {DAY_LABEL[s.day]} {timeRange(s.from.end, s.to.start)}: building {s.from.building} →{' '}
              {s.to.building}, ≈{s.walk} min walk, {s.available} min to get there
            </li>
          ))}
          <li className="muted small">Experimental: walking times are rough estimates from the campus layout.</li>
        </ul>
      )}
    </div>
  );
}
