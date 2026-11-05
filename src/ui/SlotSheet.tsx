import { useEffect, useRef } from 'react';
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
}

/** Панель «что влезет в этот слот». На телефоне — снизу, на десктопе — карточка справа. */
export function SlotSheet({ slot, semester, options, plan, onAdd, onSwitch, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const colors = new Map(plan.courses.map((c) => [c.courseId, c.color]));

  useEffect(() => {
    closeRef.current?.focus();
  }, [slot.day, slot.start]);

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
