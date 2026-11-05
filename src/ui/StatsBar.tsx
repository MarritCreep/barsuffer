import { DAY_LABEL, type Semester } from '../data/types';
import type { CreditsSummary } from '../logic/load';
import { MISERY_WEIGHTS, type MiseryResult, type MiseryTitle } from '../logic/misery';
import type { Conflict } from '../logic/schedule';
import { formatHours, sessionLabel, timeRange } from './format';

interface Props {
  semester: Semester;
  misery: MiseryResult;
  title: MiseryTitle;
  hours: number;
  credits: CreditsSummary;
  conflicts: Conflict[];
}

export function StatsBar({ semester, misery, title, hours, credits, conflicts }: Props) {
  const level = misery.score >= 70 ? 'high' : misery.score >= 40 ? 'mid' : 'low';
  const rows: [string, string, number][] = [
    ['Days on campus', `${misery.campusDays} × ${MISERY_WEIGHTS.campusDay}`, misery.points.days],
    ['Classes before 09:00', `${misery.earlyClasses} × ${MISERY_WEIGHTS.earlyClass}`, misery.points.early],
    ['Window hours', `${misery.windowHours} × ${MISERY_WEIGHTS.windowHour}`, misery.points.windows],
    ['Friday classes', misery.hasFriday ? 'yes' : 'no', misery.points.friday],
    ['Classes ending after 19:00', `${misery.lateClasses} × ${MISERY_WEIGHTS.lateClass}`, misery.points.late],
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
      </div>

      {conflicts.length > 0 && (
        <ul className="conflicts" aria-label="Conflicts">
          {conflicts.map(({ a, b }) => (
            <li key={`${a.key}|${b.key}`}>
              <strong>{DAY_LABEL[a.day]}</strong> {a.courseName} ({sessionLabel(a.type, a.sectionNumber)},{' '}
              {timeRange(a.start, a.end)}) overlaps {b.courseName} ({sessionLabel(b.type, b.sectionNumber)},{' '}
              {timeRange(b.start, b.end)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
