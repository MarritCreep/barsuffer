import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DAY_LABEL, DAYS, type Day, type Semester } from '../data/types';
import {
  BREAK_BUFFER_MIN,
  BUILDING_XY,
  dayJourney,
  GATES,
  gateLabel,
  pointOf,
  walkMinutes,
} from '../logic/campus';
import { CAFES } from '../logic/coffee';
import type { PlacedMeeting } from '../logic/schedule';
import { dayWalkMeters, formatDistance, stepsFor } from '../logic/walking';
import { place, sessionLabel, timeRange } from './format';

interface Props {
  /** Занятия семестра (без блокировок). */
  meetingsFor: (semester: Semester) => PlacedMeeting[];
  initialSemester: Semester;
  /** День, который открыть по умолчанию (например, сегодня). */
  initialDay: Day | null;
  hidden: boolean;
  /** Ворота входа (общая настройка); '' — без ворот. */
  gate: string;
  onGate: (gate: string) => void;
}

type DayChoice = Day | 'week';
type XY = [number, number];
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const WINDOW_KEY = 'barsuffer:map-window:v1';
const MIN_W = 420;
const MIN_H = 380;

const BUILDINGS = Object.entries(BUILDING_XY);
const ALL_POINTS: XY[] = [...BUILDINGS.map(([, p]) => p), ...Object.values(GATES)];
const PAD = 40;

function bbox(points: XY[], pad: number) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + pad * 2,
    h: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
}

const CAMPUS = bbox(ALL_POINTS, PAD);

/** Окно просмотра вокруг маршрута, не меньше заданного размера и в пределах кампуса. */
function fitView(points: XY[]) {
  if (points.length === 0) return CAMPUS;
  const b = bbox(points, 90);
  const w = Math.max(b.w, 360);
  const h = Math.max(b.h, 420);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Выпуклая оболочка зданий — контур «кампуса» на нашей схеме. */
function hull(points: XY[]): XY[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (pts: XY[]) => {
    const out: XY[] = [];
    for (const pt of pts) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, pt) <= 0) out.pop();
      out.push(pt);
    }
    return out;
  };
  const lower = build(p);
  const upper = build([...p].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const HULL = hull(BUILDINGS.map(([, p]) => p))
  .map(([x, y]) => `${x},${y}`)
  .join(' ');

/** Отрезок между двумя точками, укороченный с концов — чтобы стрелка не пряталась под кружком. */
function trimmed(a: XY, b: XY, startCut: number, endCut: number) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return {
    x1: a[0] + (dx / len) * startCut,
    y1: a[1] + (dy / len) * startCut,
    x2: b[0] - (dx / len) * endCut,
    y2: b[1] - (dy / len) * endCut,
    mx: (a[0] + b[0]) / 2,
    my: (a[1] + b[1]) / 2,
    len,
  };
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно */
  }
}

function useDesktop(): boolean {
  const query = '(min-width: 900px)';
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}

function clampRect(r: Rect): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(r.width, MIN_W), vw - 16);
  const height = Math.min(Math.max(r.height, MIN_H), vh - 16);
  return {
    width,
    height,
    left: Math.min(Math.max(r.left, 8), vw - width - 8),
    top: Math.min(Math.max(r.top, 8), vh - height - 8),
  };
}

export function CampusMap({ meetingsFor, initialSemester, initialDay, hidden, gate, onGate }: Props) {
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  const [semester, setSemester] = useState<Semester>(initialSemester);
  const [choice, setChoice] = useState<DayChoice>(initialDay ?? 'week');
  const setGate = onGate;
  const [wholeCampus, setWholeCampus] = useState(false);
  const [rect, setRect] = useState<Rect | null>(() => readJSON<Rect>(WINDOW_KEY));
  const [maximized, setMaximized] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // При открытии — текущий семестр и сегодняшний день; дальше студент сам листает дни.
  useEffect(() => {
    if (open) {
      setSemester(initialSemester);
      setChoice(initialDay ?? 'week');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const meetings = useMemo(() => meetingsFor(semester).filter((m) => !m.isBlock), [meetingsFor, semester]);
  const journey = choice === 'week' ? null : dayJourney(meetings, choice, gate || undefined);
  const stops = journey ? journey.stops : meetings;

  // Здания для подсветки: номера остановок (день) или просто цвет курса (вся неделя).
  const marks = new Map<string, { color: number; order: number[] }>();
  stops.forEach((m, i) => {
    if (!pointOf(m.building) || !m.building) return;
    const mark = marks.get(m.building) ?? { color: m.color, order: [] };
    if (journey) mark.order.push(i + 1);
    marks.set(m.building, mark);
  });
  const offMap = [...new Set(stops.filter((m) => !pointOf(m.building)).map((m) => m.courseName))];

  // Последовательность точек маршрута: ворота → пары → ворота.
  const path: { id: string; xy: XY }[] = [];
  if (journey) {
    const known = journey.stops.filter((m) => pointOf(m.building));
    if (gate && known.length > 0) path.push({ id: gate, xy: GATES[gate]! });
    for (const m of known) {
      const xy = pointOf(m.building)!;
      const prev = path[path.length - 1];
      if (!prev || prev.id !== m.building) path.push({ id: m.building!, xy });
    }
    if (gate && known.length > 0) path.push({ id: gate, xy: GATES[gate]! });
  }
  const legLines = path.slice(1).map((to, i) => {
    const from = path[i]!;
    const walk = walkMinutes(from.id, to.id);
    // «Беги!» — если это переход между парами и времени не хватает.
    const leg = journey?.legs.find((l) => l.from.building === from.id && l.to.building === to.id);
    return { from, to, walk, run: Boolean(leg?.run) };
  });

  const view =
    journey && !wholeCampus && path.length > 0
      ? fitView([...path.map((p) => p.xy)])
      : CAMPUS;

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

  // ---------- Перетаскивание и изменение размера (только десктоп) ----------
  const floating = desktop && !maximized && rect !== null;
  const style = floating ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined;

  const currentRect = (): Rect => {
    const r = panelRef.current!.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const startDrag = (e: ReactPointerEvent) => {
    if (!desktop || maximized || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, select, input, a')) return;
    e.preventDefault();
    const start = currentRect();
    const dx = e.clientX - start.left;
    const dy = e.clientY - start.top;
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clampRect({ ...start, left: ev.clientX - dx, top: ev.clientY - dy });
      setRect(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      writeJSON(WINDOW_KEY, last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startResize = (e: ReactPointerEvent) => {
    if (!desktop || maximized) return;
    e.preventDefault();
    e.stopPropagation();
    const start = currentRect();
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clampRect({
        ...start,
        width: start.width + (ev.clientX - e.clientX),
        height: start.height + (ev.clientY - e.clientY),
      });
      setRect(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      writeJSON(WINDOW_KEY, last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const toggleMaximize = () => setMaximized((m) => !m);

  return (
    <div
      ref={panelRef}
      className={`map-panel ${floating ? 'floating' : ''} ${maximized ? 'maximized' : ''}`}
      style={style}
      role="dialog"
      aria-label="Campus map"
    >
      <div
        className="slot-head map-head"
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if (desktop && !(e.target as HTMLElement).closest('button')) toggleMaximize();
        }}
        title={desktop ? 'Drag to move · double-click to maximize' : undefined}
      >
        <div>
          <span className="pick-label">Campus map · experimental</span>
          <strong className="slot-time">
            {choice === 'week' ? `Your buildings · Sem ${semester}` : `${DAY_LABEL[choice]} route · Sem ${semester}`}
          </strong>
        </div>
        <div className="map-head-btns">
          {desktop && (
            <button
              type="button"
              className="icon-btn"
              onClick={toggleMaximize}
              aria-label={maximized ? 'Restore map size' : 'Maximize map'}
              aria-pressed={maximized}
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? '❐' : '⤢'}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close map">
            ×
          </button>
        </div>
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
        <label className="block-row">
          Enter via
          <select value={gate} onChange={(e) => setGate(e.target.value)} aria-label="Campus gate">
            <option value="">— no gate —</option>
            {Object.keys(GATES).map((g) => (
              <option key={g} value={g}>
                {gateLabel(g)}
              </option>
            ))}
          </select>
        </label>
        {journey && path.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setWholeCampus((w) => !w)}>
            {wholeCampus ? 'Zoom to route' : 'Whole campus'}
          </button>
        )}
      </div>

      <div className="map-body">
        <svg
          className="map-svg"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Schematic campus map with your route"
        >
          <defs>
            <marker id="map-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
              <path className="map-arrow" d="M0,0 L10,5 L0,10 z" />
            </marker>
            <marker id="map-arrow-run" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
              <path className="map-arrow run" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>

          <polygon className="map-campus" points={HULL} />

          {BUILDINGS.map(([id, [x, y]]) =>
            marks.has(id) ? null : (
              <g key={id} className="map-building">
                <circle cx={x} cy={y} r={7} />
                <text x={x + 10} y={y + 4}>
                  {id}
                </text>
              </g>
            ),
          )}

          {Object.entries(GATES).map(([id, [x, y]]) => (
            <g key={id} className={`map-gate ${gate === id ? 'on' : ''}`}>
              <path d={`M${x - 9},${y - 8} L${x + 9},${y - 8} L${x},${y + 8} Z`} />
              <text x={x + 12} y={y + 5}>
                {id.replace('gate-', 'G')}
              </text>
            </g>
          ))}

          {CAFES.map((c) => (
            <g key={c.id} className="map-cafe">
              <title>{c.label}</title>
              <circle cx={c.xy[0]} cy={c.xy[1]} r={9} />
              <text x={c.xy[0]} y={c.xy[1] + 5}>
                ☕
              </text>
            </g>
          ))}

          {/* Маршрут: непрерывная линия со стрелками от начала дня до конца */}
          {legLines.map((leg, i) => {
            const t = trimmed(leg.from.xy, leg.to.xy, isGateId(leg.from.id) ? 12 : 20, isGateId(leg.to.id) ? 14 : 22);
            if (t.len < 1) return null;
            return (
              <g key={i} className={`map-leg ${leg.run ? 'run' : ''}`}>
                <line
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  markerEnd={`url(#${leg.run ? 'map-arrow-run' : 'map-arrow'})`}
                />
                {leg.walk !== null && t.len > 60 && (
                  <text className="map-leg-label" x={t.mx + 10} y={t.my}>
                    {leg.walk}′
                  </text>
                )}
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
          ) : journey ? (
            <>
              <p className="route-summary">
                {[gate && gateLabel(gate), ...journey.stops.map((m) => m.building ?? '?'), gate && gateLabel(gate)]
                  .filter(Boolean)
                  .join(' → ')}
                <span className="muted">
                  {' '}
                  · ≈{journey.totalWalk} min walking
                  {choice !== 'week' &&
                    (() => {
                      const meters = dayWalkMeters(meetings, choice, gate || undefined);
                      return meters > 0 ? ` · ${formatDistance(meters)} · ${stepsFor(meters).toLocaleString('en-US')} steps` : '';
                    })()}
                </span>
              </p>
              <ol className="route">
                {gate && journey.stops.length > 0 && (
                  <li>
                    <div className="route-stop route-gate">
                      <span className="route-num">▼</span>
                      <span className="result-name">Arrive at {gateLabel(gate)}</span>
                    </div>
                    <div className="route-leg">
                      {journey.arrive === null ? 'Walk time unknown' : `Walk ≈${journey.arrive} min to the first class`}
                    </div>
                  </li>
                )}
                {journey.stops.map((m, i) => {
                  const leg = i > 0 ? journey.legs[i - 1] : undefined;
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
                {gate && journey.stops.length > 0 && (
                  <li>
                    <div className="route-leg">
                      {journey.leave === null ? 'Walk time unknown' : `Walk ≈${journey.leave} min back to the gate`}
                    </div>
                    <div className="route-stop route-gate">
                      <span className="route-num">▲</span>
                      <span className="result-name">Leave via {gateLabel(gate)}</span>
                    </div>
                  </li>
                )}
              </ol>
            </>
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

      {desktop && !maximized && (
        <div
          className="map-resize"
          onPointerDown={(e) => {
            if (!rect) setRect(currentRect());
            startResize(e);
          }}
          role="presentation"
          title="Drag to resize"
        />
      )}
    </div>
  );
}

function isGateId(id: string): boolean {
  return id.startsWith('gate-');
}
