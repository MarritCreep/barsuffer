import { useEffect, useMemo, useRef, useState } from 'react';
import { ACADEMIC_CALENDAR, NO_CLASS_PERIODS } from '../data/calendar';
import type { Course, Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import { blockMeetings } from '../logic/blocks';
import type { ExamEntry } from '../logic/exams';
import { buildIcs, occurrenceEvent, type IcsEvent } from '../logic/ics';
import { collectMeetings } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import { occurrences } from '../logic/sessions';
import { toMinutes } from '../logic/time';
import { loadExams } from '../state/tools';

type Scope = Semester | 'year';

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  semester: Semester;
  onClose: () => void;
  onSaved: () => void;
}

/** Граница между экзаменами семестров A и B: начало семестра B. */
const B_START = ACADEMIC_CALENDAR.find((s) => s.semester === 'B')!.start;
const EXAM_LENGTH_MIN = 180;

/** Экспорт расписания в .ics: пары по реальным датам (без праздников), блокировки, экзамены, праздники. */
export function CalendarDialog({ plan, courses, semester, onClose, onSaved }: Props) {
  const { t, type, term } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const [scope, setScope] = useState<Scope>(semester);
  const [withClasses, setWithClasses] = useState(true);
  const [withBlocks, setWithBlocks] = useState(false);
  const [withExams, setWithExams] = useState(true);
  const [withHolidays, setWithHolidays] = useState(true);
  const exams = useMemo<ExamEntry[]>(() => loadExams(), []);

  const semesters: Semester[] = scope === 'year' ? ['A', 'B'] : [scope];
  const examsInScope = exams.filter((e) => (scope === 'year' ? true : scope === 'A' ? e.date < B_START : e.date >= B_START));
  const holidayName = (id: string) => t(`holiday.${id}` as MessageKey);

  const { events, skipped } = useMemo(() => {
    const events: IcsEvent[] = [];
    let skipped = 0;
    for (const s of semesters) {
      const classes = withClasses ? collectMeetings(plan, courses, s) : [];
      const blocks = withBlocks ? blockMeetings(plan, s) : [];
      for (const o of occurrences([...classes, ...blocks], s)) {
        const m = o.meeting;
        if (o.cancelledBy) {
          if (!m.isBlock) skipped++;
          continue;
        }
        const where =
          m.building && m.room ? t('cal.location', { b: m.building, r: m.room }) : m.building ? t('cal.building', { b: m.building }) : undefined;
        const notes = [t('cal.desc')];
        if (o.shortenedBy) notes.unshift(t('cal.shortened', { holiday: holidayName(o.shortenedBy) }));
        events.push(
          occurrenceEvent(o, {
            summary: m.isBlock
              ? t('cal.blockSummary', { label: m.courseName })
              : t('cal.summary', { course: m.courseName, type: type(m.type), group: m.sectionNumber }),
            location: where,
            description: notes.join('\n'),
          }),
        );
      }
      if (withHolidays) {
        const sem = ACADEMIC_CALENDAR.find((x) => x.semester === s)!;
        for (const p of NO_CLASS_PERIODS) {
          if (p.to < sem.start || p.from > sem.end) continue;
          events.push({ uid: `holiday-${p.id}-${p.from}@barsuffer`, date: p.from, until: p.to, summary: holidayName(p.id), description: t('cal.desc') });
        }
      }
    }
    if (withExams) {
      for (const e of examsInScope) {
        const start = e.time ? toMinutes(e.time) : undefined;
        events.push({
          uid: `exam-${e.id}@barsuffer`,
          date: e.date,
          start,
          end: start === undefined ? undefined : Math.min(start + EXAM_LENGTH_MIN, 23 * 60 + 59),
          summary: t('cal.examSummary', { label: e.label, moed: t(`cal.moed.${e.moed}` as MessageKey) }),
          description: t('cal.desc'),
        });
      }
    }
    return { events, skipped };
    // semesters выводится из scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, withClasses, withBlocks, withExams, withHolidays, plan, courses, exams, t, type]);

  const classEvents = events.filter((e) => !e.uid.startsWith('holiday-') && !e.uid.startsWith('exam-')).length;
  const nothing = classEvents === 0 && (!withExams || examsInScope.length === 0);

  const download = () => {
    const text = buildIcs(events, t('cal.calName', { term: term(scope, 'long') }));
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `barsuffer-${scope === 'year' ? 'year' : `sem-${scope.toLowerCase()}`}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onSaved();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="modal tool-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slot-head">
          <div>
            <span className="pick-label">{t('cal.kicker')}</span>
            <strong id="cal-title" className="slot-time">
              {t('cal.title')}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <span className="field-label">{t('cal.scope')}</span>
          <div className="sem-tabs" role="tablist" aria-label={t('cal.scope')}>
            {(['A', 'B', 'year'] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={scope === s} className={scope === s ? 'on' : ''} onClick={() => setScope(s)}>
                {term(s, 'long')}
              </button>
            ))}
          </div>

          <fieldset className="tool-checks">
            <legend className="field-label">{t('cal.include')}</legend>
            <label className="block-row">
              <input type="checkbox" checked={withClasses} onChange={(e) => setWithClasses(e.target.checked)} />
              {t('cal.classes')}
            </label>
            <label className="block-row">
              <input type="checkbox" checked={withBlocks} onChange={(e) => setWithBlocks(e.target.checked)} />
              {t('cal.blocks')}
            </label>
            <label className="block-row">
              <input type="checkbox" checked={withExams} onChange={(e) => setWithExams(e.target.checked)} />
              {t('cal.exams', { n: examsInScope.length })}
            </label>
            <label className="block-row">
              <input type="checkbox" checked={withHolidays} onChange={(e) => setWithHolidays(e.target.checked)} />
              {t('cal.holidays')}
            </label>
          </fieldset>

          {nothing ? (
            <p className="hint-warn">{t('cal.empty')}</p>
          ) : (
            <p className="small">
              <strong>{t('cal.count', { n: events.length })}</strong>
              {withClasses && skipped > 0 && <> {t('cal.skipped', { n: skipped })}</>}
            </p>
          )}

          <details className="tool-details">
            <summary>{t('cal.how')}</summary>
            <ul className="small">
              <li>{t('cal.google')}</li>
              <li>{t('cal.apple')}</li>
              <li>{t('cal.outlook')}</li>
            </ul>
          </details>
          <p className="muted small">{t('cal.note')}</p>

          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn" onClick={download} disabled={nothing}>
              {t('cal.download')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
