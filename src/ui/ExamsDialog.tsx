import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { EXAM_PERIODS } from '../data/calendar';
import type { Course, Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import { daysUntil, examSeason, nextExam, type ExamEntry, type ExamGap, type Moed } from '../logic/exams';
import type { Plan } from '../logic/selection';
import { localDate } from '../logic/today';
import { KEYS, loadExams, write } from '../state/tools';
import './ExamsDialog.css';

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  now: Date;
  onClose: () => void;
  onChange?: (exams: ExamEntry[]) => void;
}

const MOEDS: Moed[] = ['A', 'B', 'C'];
const OTHER = '__other';

interface Draft {
  /** Номер курса или OTHER. */
  course: string;
  label: string;
  moed: Moed;
  date: string;
  time: string;
}

function newId(): string {
  return `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Шуточный вердикт по индексу сессии. */
function examVerdict(score: number): 'chill' | 'ok' | 'coffee' | 'pray' {
  if (score <= 20) return 'chill';
  if (score <= 45) return 'ok';
  if (score <= 70) return 'coffee';
  return 'pray';
}

/** Какие периоды сессии подсказывать для курса: семестровый — свой, годовой — конец года. */
function periodsFor(course: Course | undefined): Semester[] {
  if (!course) return ['A', 'B'];
  return course.term === 'A' ? ['A'] : ['B'];
}

const inAnyPeriod = (date: string) => EXAM_PERIODS.some((p) => date >= p.start && date <= p.end);

export function ExamsDialog(props: Props) {
  const { plan, courses, now, onClose, onChange } = props;
  const { t, date: fmtDate, term } = useI18n();
  const today = localDate(now);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [exams, setExams] = useState<ExamEntry[]>(() => loadExams());

  // Курсы плана для выпадающего списка (названия не переводятся).
  const planCourses = useMemo(
    () =>
      plan.courses
        .map((pc) => courses.get(pc.courseId))
        .filter((c): c is Course => c !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [plan, courses],
  );

  const emptyDraft = (moed: Moed = 'A'): Draft => ({
    course: planCourses[0]?.courseId ?? OTHER,
    label: '',
    moed,
    date: '',
    time: '',
  });

  const [tab, setTab] = useState<Moed>('A');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commit = (next: ExamEntry[]) => {
    setExams(next);
    write(KEYS.exams, next);
    onChange?.(next);
  };

  const nameOf = (e: ExamEntry) => (e.courseId ? courses.get(e.courseId)?.name : undefined) ?? e.label;
  const moedName = (m: Moed) => t(`exams.moed.${m}` as MessageKey);

  // Даты из каталога, если они когда-нибудь там появятся.
  const prefillable = useMemo(() => {
    const out: ExamEntry[] = [];
    for (const c of planCourses) {
      const pairs: [Moed, { date: string; time?: string } | undefined][] = [
        ['A', c.exams?.moedA],
        ['B', c.exams?.moedB],
      ];
      for (const [moed, ex] of pairs) {
        if (!ex || !/^\d{4}-\d{2}-\d{2}$/.test(ex.date)) continue;
        if (exams.some((e) => e.courseId === c.courseId && e.moed === moed)) continue;
        out.push({
          id: newId(),
          courseId: c.courseId,
          label: c.name,
          moed,
          date: ex.date,
          ...(ex.time && /^\d{2}:\d{2}$/.test(ex.time) ? { time: ex.time } : {}),
        });
      }
    }
    return out;
  }, [planCourses, exams]);

  const draftCourse = draft.course === OTHER ? undefined : courses.get(draft.course);
  const duplicate =
    draftCourse !== undefined &&
    exams.some((e) => e.id !== editingId && e.courseId === draftCourse.courseId && e.moed === draft.moed);

  // Курс редактируемого экзамена мог уйти из плана — оставим его в списке.
  const editingCourse =
    draftCourse && !planCourses.some((c) => c.courseId === draftCourse.courseId) ? draftCourse : undefined;

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const label = draftCourse ? draftCourse.name : draft.label.trim();
    if (!label) return setError('exams.form.needLabel');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return setError('exams.form.needDate');
    const entry: ExamEntry = {
      id: editingId ?? newId(),
      ...(draftCourse ? { courseId: draftCourse.courseId } : {}),
      label,
      moed: draft.moed,
      date: draft.date,
      ...(/^\d{2}:\d{2}$/.test(draft.time) ? { time: draft.time } : {}),
    };
    commit(editingId ? exams.map((e) => (e.id === editingId ? entry : e)) : [...exams, entry]);
    setTab(entry.moed);
    setEditingId(null);
    setDraft({ ...emptyDraft(entry.moed), course: draft.course });
  };

  const startEdit = (e: ExamEntry) => {
    setEditingId(e.id);
    setError(null);
    setDraft({
      course: e.courseId && courses.has(e.courseId) ? e.courseId : OTHER,
      label: e.label,
      moed: e.moed,
      date: e.date,
      time: e.time ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
    setDraft(emptyDraft(tab));
  };

  const remove = (e: ExamEntry) => {
    commit(exams.filter((x) => x.id !== e.id));
    if (editingId === e.id) cancelEdit();
  };

  const next = nextExam(exams, today);
  const season = examSeason(exams, tab);
  const counts = new Map(MOEDS.map((m) => [m, exams.filter((e) => e.moed === m).length]));
  const periodDate = (iso: string) => fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal exams-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exams-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slot-head">
          <div>
            <span className="pick-label">{t('exams.kicker')}</span>
            <strong id="exams-title" className="slot-time">
              {t('exams.title')}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <div className="modal-body exams-body">
          {exams.length === 0 ? (
            <div className="exams-empty">
              <strong>{t('exams.empty.title')}</strong>
              <p className="muted">{t('exams.empty.text')}</p>
            </div>
          ) : (
            <Countdown next={next} today={today} name={next ? nameOf(next) : ''} moed={next ? moedName(next.moed) : ''} />
          )}

          <div className="exams-cols">
            <form className="exams-form" onSubmit={submit} noValidate>
              <span className="pick-label">{t(editingId ? 'exams.form.titleEdit' : 'exams.form.titleAdd')}</span>

              <label className="exams-field">
                <span>{t('exams.form.course')}</span>
                <select value={draft.course} onChange={(e) => set({ course: e.target.value })}>
                  {planCourses.map((c) => (
                    <option key={c.courseId} value={c.courseId}>
                      {c.name}
                    </option>
                  ))}
                  {editingCourse && <option value={editingCourse.courseId}>{editingCourse.name}</option>}
                  <option value={OTHER}>{t('exams.form.other')}</option>
                </select>
              </label>

              {draft.course === OTHER && (
                <label className="exams-field">
                  <span>{t('exams.form.label')}</span>
                  <input
                    type="text"
                    value={draft.label}
                    maxLength={80}
                    placeholder={t('exams.form.labelPlaceholder')}
                    onChange={(e) => set({ label: e.target.value })}
                  />
                </label>
              )}

              <fieldset className="exams-field exams-moeds">
                <legend>{t('exams.form.moed')}</legend>
                <div className="sem-tabs">
                  {MOEDS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={draft.moed === m ? 'on' : ''}
                      aria-pressed={draft.moed === m}
                      onClick={() => set({ moed: m })}
                    >
                      {moedName(m)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="exams-row">
                <label className="exams-field">
                  <span>{t('exams.form.date')}</span>
                  <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
                </label>
                <label className="exams-field">
                  <span>{t('exams.form.time')}</span>
                  <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
                </label>
              </div>

              <div className="exams-hints">
                {periodsFor(draftCourse).map((sem) => {
                  const p = EXAM_PERIODS.find((x) => x.semester === sem);
                  return p ? (
                    <span key={sem} className="muted small">
                      {t('exams.period', { sem: term(sem, 'long'), from: periodDate(p.start), to: periodDate(p.end) })}
                    </span>
                  ) : null;
                })}
                {draft.date && !inAnyPeriod(draft.date) && <span className="hint-warn">{t('exams.outside')}</span>}
                {duplicate && (
                  <span className="hint-warn">{t('exams.duplicate', { moed: moedName(draft.moed) })}</span>
                )}
                {error && (
                  <span className="hint-warn" role="alert">
                    {t(error)}
                  </span>
                )}
              </div>

              <div className="modal-actions">
                {editingId && (
                  <button type="button" className="btn btn-quiet" onClick={cancelEdit}>
                    {t('exams.form.cancelEdit')}
                  </button>
                )}
                <button type="submit" className="btn">
                  {t(editingId ? 'exams.form.save' : 'exams.form.add')}
                </button>
              </div>

              {prefillable.length > 0 && (
                <button type="button" className="link-btn small" onClick={() => commit([...exams, ...prefillable])}>
                  {t('exams.prefill', { n: prefillable.length })}
                </button>
              )}
            </form>

            {exams.length > 0 && (
              <section className="exams-season" aria-label={t('exams.timeline', { moed: moedName(tab) })}>
                <div className="sem-tabs" role="group" aria-label={t('exams.moedGroup')}>
                  {MOEDS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={tab === m ? 'on' : ''}
                      aria-pressed={tab === m}
                      onClick={() => setTab(m)}
                    >
                      {t('exams.tab', { moed: moedName(m), count: counts.get(m) ?? 0 })}
                    </button>
                  ))}
                </div>

                {season.exams.length === 0 ? (
                  <p className="empty">{t('exams.emptyMoed', { moed: moedName(tab) })}</p>
                ) : (
                  <>
                    <Score score={season.score} />
                    {season.sameDay.length > 0 && (
                      <p className="exams-alert" role="status">
                        {t('exams.sameDayAlert', { n: new Set(season.sameDay.map(([a]) => a.date)).size })}
                      </p>
                    )}
                    <ol className="exams-timeline">
                      {season.exams.map((e, i) => {
                        const gap = i > 0 ? season.gaps[i - 1] : undefined;
                        const past = e.date < today;
                        const name = nameOf(e);
                        return (
                          <Fragment key={e.id}>
                            {gap && <GapRow gap={gap} tightest={season.gaps.length > 1 && gap === season.tightest} />}
                            <li className={`exams-item${past ? ' is-past' : ''}${editingId === e.id ? ' is-editing' : ''}`}>
                              <span className="exams-date">
                                {fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                                {e.time && <span className="muted"> · {e.time}</span>}
                              </span>
                              <span className="exams-name">
                                {name}
                                {past && <span className="chip">{t('exams.past')}</span>}
                              </span>
                              <span className="exams-actions">
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-small"
                                  onClick={() => startEdit(e)}
                                  aria-label={t('exams.editAria', { name })}
                                >
                                  {t('exams.edit')}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-quiet btn-small"
                                  onClick={() => remove(e)}
                                  aria-label={t('exams.deleteAria', { name })}
                                >
                                  {t('exams.delete')}
                                </button>
                              </span>
                            </li>
                          </Fragment>
                        );
                      })}
                    </ol>
                  </>
                )}
              </section>
            )}
          </div>

          <p className="muted small exams-disclaimer">{t('exams.disclaimer')}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Countdown({ next, today, name, moed }: { next: ExamEntry | null; today: string; name: string; moed: string }) {
  const { t, date } = useI18n();
  if (!next) return <p className="exams-countdown exams-done">{t('exams.allDone')}</p>;
  const n = daysUntil(next, today);
  const when = n <= 0 ? t('exams.today') : n === 1 ? t('exams.tomorrow') : t('exams.inDays', { n });
  return (
    <div className={`exams-countdown${n <= 1 ? ' is-soon' : ''}`} aria-live="polite">
      <span className="pick-label">{t('exams.next')}</span>
      <strong className="exams-when">{when}</strong>
      <span className="exams-what">
        {name} · {moed} · {date(next.date, { weekday: 'long', day: 'numeric', month: 'long' })}
        {next.time && ` · ${next.time}`}
      </span>
    </div>
  );
}

function GapRow({ gap, tightest }: { gap: ExamGap; tightest: boolean }) {
  const { t } = useI18n();
  const sameDay = gap.from.date === gap.to.date;
  const text = sameDay
    ? t('exams.gap.sameDay')
    : gap.studyDays === 0
      ? t('exams.gap.none')
      : t('exams.gap.study', { n: gap.studyDays });
  return (
    <li className={`exams-gap${sameDay ? ' is-same' : ''}${tightest ? ' is-tightest' : ''}`}>
      <span>{text}</span>
      {tightest && !sameDay && <span className="chip exams-tight-chip">{t('exams.gap.tightest')}</span>}
    </li>
  );
}

function Score({ score }: { score: number }) {
  const { t, num } = useI18n();
  const verdict = examVerdict(score);
  return (
    <div className={`exams-score v-${verdict}`}>
      <div className="exams-score-top">
        <span className="exams-score-num">{num(score)}</span>
        <span className="exams-score-text">
          <span className="pick-label">{t('exams.score')}</span>
          <span className="exams-verdict">{t(`exams.verdict.${verdict}` as MessageKey)}</span>
        </span>
      </div>
      <div
        className="exams-meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label={t('exams.scoreAria', { score })}
      >
        <span style={{ inlineSize: `${score}%` }} />
      </div>
    </div>
  );
}
