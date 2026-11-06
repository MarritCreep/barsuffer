import { useEffect, useMemo, useState } from 'react';
import { DAY_LABEL, DAYS, type Day, type Semester } from '../data/types';
import { BREAK_BUFFER_MIN, BUILDING_XY, dayRoute } from '../logic/campus';
import type { PlacedMeeting } from '../logic/schedule';
import { place, sessionLabel, timeRange } from './format';

interface Props {
  /** Занятия семестра (без блокировок). */
  meetingsFor: (semester: Semester) => PlacedMeeting[];
  initialSemester: Semester;
  /** День, который открыть по умолчанию (например, сегодня). */
  initialDay: Day | null;
  hidden: boolean;
}

type DayChoice = Day | 'week';

const POINTS = Object.entries(BUILDING_XY);
const XS = POINTS.map(([, [x]]) => x);
const YS = POINTS.map(([, [, y]]) => y);
const PAD = 40;
const VIEW = {
  x: Math.min(...XS) - PAD,
  y: Math.min(...YS) - PAD,
  w: Math.max(...XS) - Math.min(...XS) + PAD * 2,
  h: Math.max(...YS) - Math.min(...YS) + PAD * 2,
};

/** Выпуклая оболочка зданий — контур «кампуса» на нашей схеме. */
function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: [number, number][] = [];
  for (const pt of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const HULL = hull(POINTS.map(([, xy]) => xy))
  .map(([x, y]) => `${x},${y}`)
  .join(' ');

export function CampusMap({ meetingsFor, initialSemester, initialDay, hidden }: Props) {
  const [open, setOpen] = useState(false);
  const [semester, setSemester] = useState<Semester>(initialSemester);
  const [choice, setChoice] = useState<DayChoice>(initialDay ?? 'week');

  // При открытии — текущий семестр и сегодняшний день.
  useEffect(() => {
    if (open) {
      setSemester(initialSemester);
      setChoice(initialDay ?? 'week');
    }
    // Только в момент открытия: дальше студент сам листает дни.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const meetings = useMemo(() => meetingsFor(semester).filter((m) => !m.isBlock), [meetingsFor, semester]);
  const route = choice === 'week' ? null : dayRoute(meetings, choice);

  // Здания для подсветки: номер остановки (в режиме дня) или просто цвет курса (вся неделя).
  const marks = new Map<string, { color: number; order: number[] }>();
  const stops = route ? route.stops : meetings;
  stops.forEach((m, i) => {
    if (!m.building || !BUILDING_XY[m.building]) return;
    const mark = marks.get(m.building) ?? { color: m.color, order: [] };
    if (route) mark.order.push(i + 1);
    marks.set(m.building, mark);
  });
  const offMap = [...new Set(stops.filter((m) => !m.building || !BUILDING_XY[m.building]).map((m) => m.courseName))];

  if (hidden && !open) return null;

  if (!open) {
    return (
      <button type="button" className="map-fab" onClick={() => setOpen(true)} aria-label="Open campus map">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        <span>Map</span>
      </button>
    );
  }

  return (
    <div className="map-panel" role="dialog" aria-label="Campus map">
      <div className="slot-head">
        <div>
          <span className="pick-label">Campus map · experimental</span>
          <strong className="slot-time">
            {choice === 'week' ? `Your buildings · Sem ${semester}` : `${DAY_LABEL[choice]} route · Sem ${semester}`}
          </strong>
        </div>
        <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close map">
          ×
        </button>
      </div>

      <div className="map-controls">
        <div className="sem-tabs" role="tablist" aria-label="Map semester">
          {(['A', 'B'] as Semester[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={semester === s}
              className={semester === s ? 'on' : ''}
              onClick={() => setSemester(s)}
            >
              Sem {s}
            </button>
          ))}
        </div>
        <div className="day-chips" role="tablist" aria-label="Map day">
          <button
            type="button"
            role="tab"
            aria-selected={choice === 'week'}
            className={`chip chip-btn ${choice === 'week' ? 'on' : ''}`}
            onClick={() => setChoice('week')}
          >
            Week
          </button>
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={choice === d}
              className={`chip chip-btn ${choice === d ? 'on' : ''}`}
              onClick={() => setChoice(d)}
            >
              {DAY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="map-body">
        <svg
          className="map-svg"
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Schematic campus map with your buildings"
        >
          <polygon className="map-campus" points={HULL} />
          {route?.legs.map((leg, i) => {
            const a = leg.from.building ? BUILDING_XY[leg.from.building] : undefined;
            const b = leg.to.building ? BUILDING_XY[leg.to.building] : undefined;
            if (!a || !b || leg.walk === 0) return null;
            return (
              <line
                key={i}
                className={`map-leg ${leg.run ? 'run' : ''}`}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
              />
            );
          })}
          {POINTS.map(([id, [x, y]]) => {
            const mark = marks.get(id);
            if (mark) return null;
            return (
              <g key={id} className="map-building">
                <circle cx={x} cy={y} r={7} />
                <text x={x + 10} y={y + 4}>
                  {id}
                </text>
              </g>
            );
          })}
          {[...marks.entries()].map(([id, mark]) => {
            const [x, y] = BUILDING_XY[id]!;
            return (
              <g key={id} className={`map-mark c${mark.color}`}>
                <circle cx={x} cy={y} r={16} />
                <text className="map-mark-num" x={x} y={y + 5}>
                  {mark.order.length > 0 ? mark.order.join(',') : '•'}
                </text>
                <text className="map-mark-label" x={x + 21} y={y + 5}>
                  {id}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="map-list">
          {stops.length === 0 ? (
            <p className="today-empty">
              {choice === 'week'
                ? `No classes in Semester ${semester} yet.`
                : `No classes on ${DAY_LABEL[choice]} in Semester ${semester}.`}
            </p>
          ) : route ? (
            <ol className="route">
              {route.stops.map((m, i) => {
                const leg = i > 0 ? route.legs[i - 1] : undefined;
                return (
                  <li key={m.key}>
                    {leg && (
                      <div className={`route-leg ${leg.run ? 'run' : ''}`}>
                        {leg.to.start < leg.from.end
                          ? 'Overlaps the previous class'
                          : leg.walk === null
                            ? 'Walk time unknown (building not on the map)'
                            : leg.walk === 0
                              ? 'Same building'
                              : `Walk ≈${leg.walk} min · ${leg.available} min to get there`}
                        {leg.run && <strong> · Run!</strong>}
                      </div>
                    )}
                    <div className={`route-stop c${m.color}`}>
                      <span className="route-num">{i + 1}</span>
                      <span className="agenda-main">
                        <span className="result-name">{m.courseName}</span>
                        <span className="result-meta">
                          {timeRange(m.start, m.end)} · {sessionLabel(m.type, m.sectionNumber)}
                          {place(m.building, m.room) && ` · ${place(m.building, m.room)}`}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <ul className="route">
              {[...new Map(meetings.map((m) => [m.courseId, m])).values()].map((m) => (
                <li key={m.courseId} className={`route-stop c${m.color}`}>
                  <span className="route-num">•</span>
                  <span className="agenda-main">
                    <span className="result-name">{m.courseName}</span>
                    <span className="result-meta">
                      {meetings
                        .filter((x) => x.courseId === m.courseId)
                        .map((x) => `${DAY_LABEL[x.day]} · ${place(x.building, x.room) || 'no room'}`)
                        .join(', ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {offMap.length > 0 && <p className="muted small">Not on the map: {offMap.join(', ')}</p>}
          <p className="muted small">
            Schematic, not to scale. Walk times are rough guesses (we assume {BREAK_BUFFER_MIN} min between
            back-to-back classes). Rooms may change — check Inbar.
          </p>
        </div>
      </div>
    </div>
  );
}
