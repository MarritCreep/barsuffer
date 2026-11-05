import type { CSSProperties } from 'react';
import { DAY_LABEL, DAYS, type Course, type Day, type Section, type Semester } from '../data/types';
import {
  assignLanes,
  placeSection,
  termIncludes,
  type Conflict,
  type PlacedMeeting,
  type TimeSpan,
} from '../logic/schedule';
import { findSection, isCompatible, type Plan } from '../logic/selection';
import { formatMinutes } from '../logic/time';
import { place, sessionLabel, TERM_LABEL, timeRange } from './format';

export const GRID_START = 8 * 60;
export const GRID_END = 22 * 60;
const HOURS = Array.from({ length: (GRID_END - GRID_START) / 60 }, (_, i) => GRID_START + i * 60);

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  semester: Semester;
  onSemester: (s: Semester) => void;
  meetings: PlacedMeeting[];
  conflicts: Conflict[];
  unscheduled: { course: Course; section: Section; color: number }[];
  activeCourse: Course | null;
  onActivate: (courseId: string) => void;
  onToggleSection: (course: Course, sectionNumber: string) => void;
  onDone: () => void;
  /** Выбранная пустая клетка (для «что влезет»). */
  slot: TimeSpan | null;
  onSlot: (day: Day, start: number) => void;
  onAutoPick: () => void;
  /** Удалить курс из расписания (крестик на блоке). */
  onRemove: (courseId: string) => void;
}

interface Block extends PlacedMeeting {
  ghost: boolean;
  /** Призрак, при выборе которого сменится привязанная группа. */
  needsParent?: string;
  conflict: boolean;
  activeSelected: boolean;
  dim: boolean;
}

export function WeekGrid(props: Props) {
  const { plan, semester, onSemester, meetings, conflicts, unscheduled, activeCourse } = props;
  const planned = activeCourse ? plan.courses.find((c) => c.courseId === activeCourse.courseId) : undefined;
  const conflictKeys = new Set(conflicts.flatMap((c) => [c.a.key, c.b.key]));

  const blocks: Block[] = meetings.map((m) => ({
    ...m,
    ghost: false,
    conflict: conflictKeys.has(m.key),
    activeSelected: m.courseId === activeCourse?.courseId,
    dim: activeCourse !== null && m.courseId !== activeCourse.courseId,
  }));

  if (activeCourse && planned) {
    for (const section of activeCourse.sections) {
      if (planned.picks[section.type] === section.sectionNumber) continue;
      const compatible = isCompatible(section, planned.picks);
      const parent = !compatible && section.linkedTo ? findSection(activeCourse, section.linkedTo[0]!) : undefined;
      for (const m of placeSection(activeCourse, section, semester, planned.color)) {
        blocks.push({
          ...m,
          key: `ghost-${m.key}`,
          ghost: true,
          needsParent: parent ? sessionLabel(parent.type, parent.sectionNumber) : undefined,
          conflict: false,
          activeSelected: false,
          dim: false,
        });
      }
    }
  }

  const laid = assignLanes(blocks);
  const activeInSemester = activeCourse ? termIncludes(activeCourse.term, semester) : false;
  const activeUntimed = activeCourse?.sections.filter((s) => s.schedule.length === 0) ?? [];

  const handleClick = (b: Block) => {
    if (activeCourse && b.courseId === activeCourse.courseId) {
      props.onToggleSection(activeCourse, b.sectionNumber);
    } else {
      props.onActivate(b.courseId);
    }
  };

  return (
    <div className="week">
      <div className="week-toolbar">
        <div className="sem-tabs" role="tablist" aria-label="Semester">
          {(['A', 'B'] as Semester[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={semester === s}
              className={semester === s ? 'on' : ''}
              onClick={() => onSemester(s)}
            >
              Semester {s}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-auto" onClick={props.onAutoPick}>
          Auto-pick
        </button>
      </div>

      {activeCourse && planned && (
        <div className={`pick-banner c${planned.color}`}>
          <div className="pick-text">
            <span className="pick-label">Choosing groups</span>
            <strong>{activeCourse.name}</strong>
            {activeInSemester ? (
              <span className="muted small">Tap a dashed block to pick it, tap a picked one to drop it.</span>
            ) : (
              <span className="muted small">
                This course runs in {TERM_LABEL[activeCourse.term]}.{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onSemester(activeCourse.term === 'B' ? 'B' : 'A')}
                >
                  Show it
                </button>
              </span>
            )}
            {activeUntimed.length > 0 && (
              <span className="untimed-picks">
                <span className="muted small">No fixed time:</span>
                {activeUntimed.map((s) => {
                  const on = planned.picks[s.type] === s.sectionNumber;
                  return (
                    <button
                      key={s.sectionNumber}
                      type="button"
                      className={`chip chip-btn ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      onClick={() => props.onToggleSection(activeCourse, s.sectionNumber)}
                    >
                      {sessionLabel(s.type, s.sectionNumber)}
                    </button>
                  );
                })}
              </span>
            )}
          </div>
          <button type="button" className="btn" onClick={props.onDone}>
            Done
          </button>
        </div>
      )}

      <div className="grid" role="grid" aria-label={`Week, semester ${semester}`}>
        <div className="grid-head" role="row">
          <span className="corner" />
          {DAYS.map((d) => (
            <span key={d} className="day-name" role="columnheader">
              {DAY_LABEL[d]}
            </span>
          ))}
        </div>
        <div className="grid-body">
          <div className="time-col" aria-hidden="true">
            {HOURS.map((h) => (
              <span key={h} className="hour">
                {formatMinutes(h)}
              </span>
            ))}
          </div>
          {DAYS.map((d) => (
            <div key={d} className="day-col" role="gridcell">
              {HOURS.map((h, i) => {
                const on = props.slot?.day === d && props.slot.start === h;
                return (
                  <button
                    key={h}
                    type="button"
                    className={`cell ${on ? 'on' : ''}`}
                    style={{ top: `calc(var(--row-h) * ${i})` }}
                    onClick={() => props.onSlot(d, h)}
                    aria-label={`What fits on ${DAY_LABEL[d]} ${timeRange(h, h + 60)}`}
                    aria-pressed={on}
                  />
                );
              })}
              {laid
                .filter(({ item }) => item.day === d)
                .map(({ item: b, lane, lanes }) => {
                  const start = Math.max(b.start, GRID_START);
                  const end = Math.min(b.end, GRID_END);
                  if (end <= start) return null;
                  const style: CSSProperties = {
                    top: `calc(var(--row-h) * ${(start - GRID_START) / 60})`,
                    height: `calc(var(--row-h) * ${(end - start) / 60} - 2px)`,
                    left: `calc(${(lane / lanes) * 100}% + 1px)`,
                    width: `calc(${100 / lanes}% - 2px)`,
                  };
                  const cls = [
                    'event',
                    `c${b.color}`,
                    end - start <= 60 && 'short',
                    b.ghost && 'ghost',
                    b.needsParent && 'ghost-linked',
                    b.conflict && 'conflict',
                    b.activeSelected && 'active',
                    b.dim && 'dim',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const where = place(b.building, b.room);
                  const label = [
                    b.ghost ? 'Option:' : '',
                    b.courseName,
                    sessionLabel(b.type, b.sectionNumber),
                    DAY_LABEL[b.day],
                    timeRange(b.start, b.end),
                    b.lecturer,
                    where && `room ${where}`,
                    b.needsParent && `switches to ${b.needsParent}`,
                    b.conflict && 'conflict',
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <div
                      key={b.key}
                      className={`ev-wrap ${b.activeSelected ? 'active' : ''} ${b.dim ? 'dim' : ''}`}
                      style={style}
                    >
                    <button
                      type="button"
                      className={cls}
                      onClick={() => handleClick(b)}
                      aria-label={label}
                      title={label}
                    >
                      <span className="ev-name">{b.courseName}</span>
                      <span className="ev-line">
                        {sessionLabel(b.type, b.sectionNumber)}
                        {b.isDemo && <span className="demo-tag">DEMO</span>}
                      </span>
                      <span className="ev-line ev-time">{timeRange(b.start, b.end)}</span>
                      {where && <span className="ev-line">{where}</span>}
                      {b.lecturer && <span className="ev-line ev-lecturer">{b.lecturer}</span>}
                      {b.needsParent && <span className="ev-line ev-note">→ {b.needsParent}</span>}
                      {b.conflict && (
                        <span className="ev-flag" aria-hidden="true">
                          !
                        </span>
                      )}
                    </button>
                    {!b.ghost && (
                      <button
                        type="button"
                        className="ev-remove"
                        onClick={() => props.onRemove(b.courseId)}
                        aria-label={`Remove ${b.courseName} from schedule`}
                        title="Remove course (Ctrl+Z to undo)"
                      >
                        ×
                      </button>
                    )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="unscheduled">
          <h3>Not on the grid (no fixed time)</h3>
          <ul>
            {unscheduled.map(({ course, section, color }) => (
              <li key={`${course.courseId}-${section.sectionNumber}`} className={`c${color}`}>
                <span className="dot" />
                {course.name} · {sessionLabel(section.type, section.sectionNumber)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
