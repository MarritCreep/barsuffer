import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMinutes } from '../logic/time';
import type { Catalog, Course, Section, Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { TimeSpan } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import { activeCount, buildFacets, matchFilter, type CourseFilter, type FilterGroup } from '../logic/filters';
import type { SlotOption } from '../logic/slots';
import { CourseFilters } from './CourseFilters';
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
  /** Фильтр панели клетки (живёт в приложении, чтобы не вводить заново на каждой клетке). */
  filter: CourseFilter;
  onFilter: (f: CourseFilter) => void;
  catalog: Pick<Catalog, 'faculties' | 'departments'>;
}

/** Семестр, день и время задаёт сама клетка. */
const SLOT_HIDE: FilterGroup[] = ['terms', 'days', 'time'];

const LAST_END = 22 * 60;

/** Панель «что влезет в этот слот». На телефоне — снизу, на десктопе — карточка справа. */
export function SlotSheet({ slot, semester, options, plan, onAdd, onSwitch, onClose, onAddBlock, filter, onFilter, catalog }: Props) {
  const { t, day, type, term } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const colors = new Map(plan.courses.map((c) => [c.courseId, c.color]));
  const [blockOpen, setBlockOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [end, setEnd] = useState(slot.end);
  const [both, setBoth] = useState(true);
  // Сначала фильтр, потом список. Если в этом часе ничего нет — сразу пустой список.
  const [step, setStep] = useState<'filter' | 'list'>('filter');
  const slotFilter: CourseFilter = { ...filter, query: '', terms: [], days: [], timeFrom: null, timeTo: null };
  const facets = useMemo(
    () => {
      // Только группы, которые идут в этой клетке, — иначе фильтр предлагал бы то, чего здесь нет.
      const byCourse = new Map<string, Course>();
      for (const o of options) {
        const c = byCourse.get(o.course.courseId) ?? { ...o.course, sections: [] };
        c.sections = [...c.sections, o.section];
        byCourse.set(c.courseId, c);
      }
      return buildFacets({ ...catalog, courses: [...byCourse.values()] });
    },
    [options, catalog],
  );
  const filtered = options.filter((o) => {
    const sections = matchFilter(o.course, slotFilter, { catalog, slot: { semester, span: slot } });
    return sections?.includes(o.section) ?? false;
  });
  const active = activeCount(slotFilter, SLOT_HIDE);
  const shown = step === 'list' ? filtered : [];
  const ends: number[] = [];
  for (let m = slot.start + 60; m <= LAST_END; m += 30) ends.push(m);

  useEffect(() => {
    closeRef.current?.focus();
    setEnd(slot.end);
    setBlockOpen(false);
    setStep('filter');
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
      ) : step === 'filter' ? (
        <div className="slot-filter">
          <strong className="slot-filter-title">
            {t('filters.slotTitle', { when: `${day(slot.day, 'long')} ${timeRange(slot.start, slot.end)}` })}
          </strong>
          <p className="muted small">{t('filters.slotHint')}</p>
          <CourseFilters facets={facets} filter={slotFilter} onChange={onFilter} catalog={catalog} hide={SLOT_HIDE} />
          <div className="slot-filter-actions">
            {active > 0 && (
              <button type="button" className="btn btn-quiet" onClick={() => { onFilter({ ...slotFilter, categories: [], faculties: [], departments: [], types: [], places: [], credits: [], languages: [] }); setStep('list'); }}>
                {t('filters.showAll', { n: options.length })}
              </button>
            )}
            <button type="button" className="btn" onClick={() => setStep('list')}>
              {t('filters.show', { n: filtered.length })}
            </button>
          </div>
        </div>
      ) : (
        <>
        <div className="slot-list-head">
          <span className="muted small">
            {t('filters.count', { n: filtered.length })}
            {active > 0 && ` · ${t('filters.active', { n: active })}`}
          </span>
          <button type="button" className="link-btn" onClick={() => setStep('filter')}>
            {t('filters.change')}
          </button>
        </div>
        {filtered.length === 0 && <p className="empty slot-empty">{t('filters.none')}</p>}
        <ul className="slot-list">
          {shown.map(({ course, section, meetings, inPlan, conflicts }) => {
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
        </>
      )}
    </aside>
  );
}
