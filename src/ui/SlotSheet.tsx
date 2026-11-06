import { useEffect, useRef, useState } from 'react';
import { formatMinutes } from '../logic/time';
import { DAY_LABEL, type Course, type Section, type Semester } from '../data/types';
import type { TimeSpan } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import type { SlotOption } from '../logic/slots';
import { place, sessionLabel, timeRange } from './format';

interface Props {
  slot: TimeSpan;
  semester: Semester;
  options: SlotOption[];
  plan: Plan;
  onAdd: (course: Course, section: Section) => void;
  onSwitch: (course: Course, section: Section) => void;
  onClose: () => void;
  /** Занять это время личной блокировкой. */
  onAddBlock: (label: string, end: number, bothSemesters: boolean) => void;
}

const LAST_END = 22 * 60;

/** Панель «что влезет в этот слот». На телефоне — снизу, на десктопе — карточка справа. */
export function SlotSheet({ slot, semester, options, plan, onAdd, onSwitch, onClose, onAddBlock }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const colors = new Map(plan.courses.map((c) => [c.courseId, c.color]));
  const [blockOpen, setBlockOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [end, setEnd] = useState(slot.end);
  const [both, setBoth] = useState(true);
  const ends: number[] = [];
  for (let t = slot.start + 60; t <= LAST_END; t += 30) ends.push(t);

  useEffect(() => {
    closeRef.current?.focus();
    setEnd(slot.end);
    setBlockOpen(false);
  }, [slot.day, slot.start, slot.end]);

  return (
    <aside className="slot-sheet" role="dialog" aria-label="Courses for this time slot">
      <div className="slot-head">
        <div>
          <span className="pick-label">What fits here · Sem {semester}</span>
          <strong className="slot-time">
            {DAY_LABEL[slot.day]} {timeRange(slot.start, slot.end)}
          </strong>
        </div>
        <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="block-form">
        {blockOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAddBlock(label.trim() || 'Busy', end, both);
              setLabel('');
              setBlockOpen(false);
            }}
          >
            <input
              className="search block-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Work, gym, anything"
              aria-label="What is this time for"
              maxLength={40}
              autoFocus
            />
            <label className="block-row">
              Until
              <select value={end} onChange={(e) => setEnd(Number(e.target.value))} aria-label="Block until">
                {ends.map((t) => (
                  <option key={t} value={t}>
                    {formatMinutes(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block-row">
              <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
              Both semesters
            </label>
            <button type="submit" className="btn">
              Block it
            </button>
          </form>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={() => setBlockOpen(true)}>
            ⊘ Block this time
          </button>
        )}
      </div>

      {options.length === 0 ? (
        <p className="empty slot-empty">No courses meet at this time.</p>
      ) : (
        <ul className="slot-list">
          {options.map(({ course, section, meetings, inPlan, conflicts }) => {
            const color = colors.get(course.courseId);
            const where = place(section.schedule[0]?.building, section.schedule[0]?.room);
            return (
              <li
                key={`${course.courseId}-${section.sectionNumber}`}
                className={`slot-item ${color !== undefined ? `c${color} in-plan` : ''}`}
              >
                <div className="slot-text">
                  <span className="result-name">{course.name}</span>
                  <span className="result-meta">
                    {course.courseId} · {sessionLabel(section.type, section.sectionNumber)}
                    {(section.isDemo || course.isDemo) && <span className="demo-tag">DEMO</span>}
                  </span>
                  <span className="result-meta">
                    {meetings.map((m) => `${DAY_LABEL[m.day]} ${timeRange(m.start, m.end)}`).join(', ')}
                    {where && ` · ${where}`}
                  </span>
                  {section.lecturer && <span className="result-meta">{section.lecturer}</span>}
                  {section.linkedTo && (
                    <span className="result-meta">Comes with group {section.linkedTo.join(' / ')}</span>
                  )}
                  {conflicts > 0 && (
                    <span className="hint-warn">Overlaps your schedule</span>
                  )}
                  {inPlan && <span className="result-meta">Already in your plan — switches the group</span>}
                </div>
                {inPlan ? (
                  <button type="button" className="btn btn-quiet" onClick={() => onSwitch(course, section)}>
                    Switch
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => onAdd(course, section)}>
                    + Add
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
