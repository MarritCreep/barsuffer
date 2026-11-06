import { useEffect, useRef, useState } from 'react';
import { formatMinutes } from '../logic/time';
import type { Course, Section, Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { TimeSpan } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import type { SlotOption } from '../logic/slots';
import { place, timeRange } from './format';

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
  const { t, day, type, term } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const colors = new Map(plan.courses.map((c) => [c.courseId, c.color]));
  const [blockOpen, setBlockOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [end, setEnd] = useState(slot.end);
  const [both, setBoth] = useState(true);
  const ends: number[] = [];
  for (let m = slot.start + 60; m <= LAST_END; m += 30) ends.push(m);

  useEffect(() => {
    closeRef.current?.focus();
    setEnd(slot.end);
    setBlockOpen(false);
  }, [slot.day, slot.start, slot.end]);

  return (
    <aside className="slot-sheet" role="dialog" aria-label={t('slot.aria')}>
      <div className="slot-head">
        <div>
          <span className="pick-label">{t('slot.whatFits', { sem: term(semester) })}</span>
          <strong className="slot-time">
            {day(slot.day)} <span dir="ltr">{timeRange(slot.start, slot.end)}</span>
          </strong>
        </div>
        <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      </div>

      <div className="block-form">
        {blockOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAddBlock(label.trim() || t('slot.busy'), end, both);
              setLabel('');
              setBlockOpen(false);
            }}
          >
            <input
              className="search block-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('slot.blockLabelPlaceholder')}
              aria-label={t('slot.blockLabelAria')}
              maxLength={40}
              autoFocus
            />
            <label className="block-row">
              {t('slot.until')}
              <select value={end} onChange={(e) => setEnd(Number(e.target.value))} aria-label={t('slot.untilAria')}>
                {ends.map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block-row">
              <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
              {t('slot.both')}
            </label>
            <button type="submit" className="btn">
              {t('slot.blockIt')}
            </button>
          </form>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={() => setBlockOpen(true)}>
            {t('slot.blockThis')}
          </button>
        )}
      </div>

      {options.length === 0 ? (
        <p className="empty slot-empty">{t('slot.empty')}</p>
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
                    {course.courseId} · {type(section.type)} {section.sectionNumber}
                    {(section.isDemo || course.isDemo) && <span className="demo-tag">{t('common.demo')}</span>}
                  </span>
                  <span className="result-meta">
                    {meetings.map((m) => `${day(m.day)} ${timeRange(m.start, m.end)}`).join(', ')}
                    {where && ` · ${where}`}
                  </span>
                  {section.lecturer && <span className="result-meta">{section.lecturer}</span>}
                  {section.linkedTo && (
                    <span className="result-meta">{t('slot.comesWith', { groups: section.linkedTo.join(' / ') })}</span>
                  )}
                  {conflicts > 0 && <span className="hint-warn">{t('slot.overlaps')}</span>}
                  {inPlan && <span className="result-meta">{t('slot.inPlan')}</span>}
                </div>
                {inPlan ? (
                  <button type="button" className="btn btn-quiet" onClick={() => onSwitch(course, section)}>
                    {t('slot.switch')}
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => onAdd(course, section)}>
                    {t('courses.add')}
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
