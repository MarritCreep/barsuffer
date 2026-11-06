import type { CSSProperties } from 'react';
import { DAYS, type Course, type Day, type Section, type Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import {
  assignLanes,
  placeSection,
  termIncludes,
  type Conflict,
  type PlacedMeeting,
  type TimeSpan,
} from '../logic/schedule';
import type { Sprint } from '../logic/campus';
import { miseryDelta } from '../logic/preview';
import { findSection, isCompatible, type Plan } from '../logic/selection';
import { formatMinutes } from '../logic/time';
import { place } from './format';
import { group, span } from './weekText';

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
  /** Удалить курс или блокировку (крестик на блоке). */
  onRemove: (courseId: string) => void;
  /** Переходы, на которые не хватает времени («Беги!»). */
  sprints: Sprint[];
  /** Индекс каждого дня — «карта страданий недели». */
  dayScores: Map<Day, number>;
  hellDay: Day | null;
  onWrapped: () => void;
}

function heatLevel(score: number): 'low' | 'mid' | 'high' {
  return score >= 25 ? 'high' : score >= 15 ? 'mid' : 'low';
}

interface Block extends PlacedMeeting {
  ghost: boolean;
  /** Призрак, при выборе которого сменится привязанная группа. */
  needsParent?: string;
  /** Как изменится индекс страдания, если выбрать этот призрак. */
  delta?: number;
  /** «Беги!»: подсказка про переход к этому занятию. */
  sprint?: string;
  conflict: boolean;
  activeSelected: boolean;
  dim: boolean;
}

export function WeekGrid(props: Props) {
  const { plan, semester, onSemester, meetings, conflicts, unscheduled, activeCourse } = props;
  const tr = useI18n();
  const { t, day } = tr;
  const planned = activeCourse ? plan.courses.find((c) => c.courseId === activeCourse.courseId) : undefined;
  const conflictKeys = new Set(conflicts.flatMap((c) => [c.a.key, c.b.key]));
  const sprintByKey = new Map(
    props.sprints.map((s) => [
      s.to.key,
      t('week.runTitle', { walk: s.walk, from: s.from.building ?? '', available: s.available }),
    ]),
  );

  const blocks: Block[] = meetings.map((m) => ({
    ...m,
    ghost: false,
    sprint: sprintByKey.get(m.key),
    conflict: conflictKeys.has(m.key),
    activeSelected: m.courseId === activeCourse?.courseId,
    dim: activeCourse !== null && m.courseId !== activeCourse.courseId,
  }));

  if (activeCourse && planned) {
    for (const section of activeCourse.sections) {
      if (!planned.hidden && planned.picks[section.type] === section.sectionNumber) continue;
      const compatible = isCompatible(section, planned.picks);
      const parent = !compatible && section.linkedTo ? findSection(activeCourse, section.linkedTo[0]!) : undefined;
      const placed = placeSection(activeCourse, section, semester, planned.color);
      const delta =
        placed.length > 0
          ? miseryDelta(plan, props.courses, semester, activeCourse, section.sectionNumber)
          : undefined;
      for (const m of placed) {
        blocks.push({
          ...m,
          key: `ghost-${m.key}`,
          ghost: true,
          delta,
          needsParent: parent ? group(tr, parent.type, parent.sectionNumber) : undefined,
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
    if (b.isBlock) return;
    if (activeCourse && b.courseId === activeCourse.courseId) {
      props.onToggleSection(activeCourse, b.sectionNumber);
    } else {
      props.onActivate(b.courseId);
    }
  };

  return (
    <div className="week">
      <div className="week-toolbar">
        <div className="sem-tabs" role="tablist" aria-label={t('week.semesterTabs')}>
          {(['A', 'B'] as Semester[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={semester === s}
              className={semester === s ? 'on' : ''}
              onClick={() => onSemester(s)}
            >
              {tr.term(s, 'long')}
            </button>
          ))}
        </div>
        <span className="toolbar-btns">
          <button type="button" className="btn btn-quiet btn-wrapped" onClick={props.onWrapped}>
            Wrapped
          </button>
          <button type="button" className="btn btn-auto" onClick={props.onAutoPick}>
            {t('week.autoPick')}
          </button>
        </span>
      </div>

      {activeCourse && planned && (
        <div className={`pick-banner c${planned.color}`}>
          <div className="pick-text">
            <span className="pick-label">{t('week.choosing')}</span>
            <strong>{activeCourse.name}</strong>
            {activeInSemester ? (
              <span className="muted small">{t('week.choosingHint')}</span>
            ) : (
              <span className="muted small">
                {t('week.otherTerm', { term: tr.term(activeCourse.term) })}{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onSemester(activeCourse.term === 'B' ? 'B' : 'A')}
                >
                  {t('week.showIt')}
                </button>
              </span>
            )}
            {activeUntimed.length > 0 && (
              <span className="untimed-picks">
                <span className="muted small">{t('week.noFixedTime')}</span>
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
                      {group(tr, s.type, s.sectionNumber)}
                    </button>
                  );
                })}
              </span>
            )}
          </div>
          <button type="button" className="btn" onClick={props.onDone}>
            {t('common.done')}
          </button>
        </div>
      )}

      <div className="grid" role="grid" aria-label={t(semester === 'B' ? 'week.gridLabel.B' : 'week.gridLabel.A')}>
        <div className="grid-head" role="row">
          <span className="corner" />
          {DAYS.map((d) => {
            const score = props.dayScores.get(d);
            const hell = props.hellDay === d;
            return (
              <span
                key={d}
                className={`day-name ${score !== undefined ? `heat-${heatLevel(score)}` : ''} ${hell ? 'hell' : ''}`}
                role="columnheader"
                title={
                  score !== undefined
                    ? t(hell ? 'week.dayTitleHell' : 'week.dayTitle', { day: day(d), n: score })
                    : undefined
                }
              >
                <span>{day(d)}</span>
                {score !== undefined && (
                  <span className="day-score">
                    {hell && <span aria-hidden="true">🔥</span>}
                    {score}
                  </span>
                )}
              </span>
            );
          })}
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
                    aria-label={t('week.whatFits', { day: day(d), time: span(tr, h, h + 60) })}
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
                    insetInlineStart: `calc(${(lane / lanes) * 100}% + 1px)`,
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
                    b.isBlock && 'busy',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const where = place(b.building, b.room);
                  const deltaText =
                    b.delta === undefined ? '' : b.delta === 0 ? '±0' : b.delta > 0 ? `+${b.delta}` : `−${-b.delta}`;
                  const time = span(tr, b.start, b.end);
                  const label = b.isBlock
                    ? [t('week.blocked', { name: b.courseName }), day(b.day), time, b.conflict && t('week.conflict')]
                        .filter(Boolean)
                        .join(', ')
                    : [
                        b.ghost ? t('week.option') : '',
                        b.courseName,
                        group(tr, b.type, b.sectionNumber),
                        day(b.day),
                        time,
                        b.lecturer,
                        where && t('week.room', { where }),
                        b.needsParent && t('week.switchesTo', { group: b.needsParent }),
                        deltaText && t('week.delta', { delta: deltaText }),
                        b.conflict && t('week.conflict'),
                        b.sprint,
                      ]
                        .filter(Boolean)
                        .join(', ');
                  return (
                    <div
                      key={b.key}
                      className={`ev-wrap ${b.activeSelected ? 'active' : ''} ${b.dim ? 'dim' : ''} ${b.isBlock ? 'is-block' : ''}`}
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
                      {b.isBlock ? (
                        <span className="ev-line">
                          {t('week.busy')} · {time}
                        </span>
                      ) : (
                      <span className="ev-line">
                        {group(tr, b.type, b.sectionNumber)}
                        {b.isDemo && <span className="demo-tag">{t('common.demo')}</span>}
                      </span>
                      )}
                      {deltaText && (
                        <span
                          className={`ev-delta ${b.delta! < 0 ? 'better' : b.delta! > 0 ? 'worse' : ''}`}
                          aria-hidden="true"
                        >
                          {deltaText}
                        </span>
                      )}
                      {b.sprint && (
                        <span className="ev-run" aria-hidden="true">
                          {t('week.run')}
                        </span>
                      )}
                      {!b.isBlock && <span className="ev-line ev-time">{time}</span>}
                      {where && <span className="ev-line">{where}</span>}
                      {b.lecturer && <span className="ev-line ev-lecturer">{b.lecturer}</span>}
                      {b.needsParent && <span className="ev-line ev-note">{tr.dir === 'rtl' ? '←' : '→'} {b.needsParent}</span>}
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
                        aria-label={
                          b.isBlock
                            ? t('week.removeBlock', { name: b.courseName })
                            : t('week.removeCourse', { name: b.courseName })
                        }
                        title={t(b.isBlock ? 'week.removeBlockTitle' : 'week.removeCourseTitle')}
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
          <h3>{t('week.unscheduled')}</h3>
          <ul>
            {unscheduled.map(({ course, section, color }) => (
              <li key={`${course.courseId}-${section.sectionNumber}`} className={`c${color}`}>
                <span className="dot" />
                {course.name} · {group(tr, section.type, section.sectionNumber)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
