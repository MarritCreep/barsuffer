import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Course } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import {
  NON_JEWISH_GENERAL,
  OLAMOT_TRACKS,
  OLAMOT_YEAR_CAP,
  degreeProgress,
  englishLevelForScore,
  englishSteps,
  type Bucket,
  type BucketProgress,
  type CourseStatus,
  type DegreeCourse,
  type DegreeProgress,
  type DegreeState,
  type DegreeWarning,
  type EnglishLevel,
  type HebrewStatus,
  type OlamotTrack,
} from '../logic/degree';
import type { Plan } from '../logic/selection';
import { KEYS, loadDegree, write } from '../state/tools';
import { rich } from './ImportDialog';
import './DegreeDialog.css';

type Tab = 'overview' | 'settings' | 'courses';
const TABS: Tab[] = ['overview', 'settings', 'courses'];
type Update = (fn: (s: DegreeState) => DegreeState) => void;
type StepLevel = Exclude<EnglishLevel, 'exempt'>;

const TRACKS = Object.keys(OLAMOT_TRACKS) as OlamotTrack[];
const LEVELS: EnglishLevel[] = ['preBasicB', 'basic', 'advA', 'advB', 'exempt'];
/** Баллы психометрии / Амиранет для каждого уровня (efl.biu.ac.il). */
const LEVEL_RANGE: Record<EnglishLevel, string> = {
  preBasicB: '70–84',
  basic: '85–99',
  advA: '100–119',
  advB: '120–133',
  exempt: '134+',
};
const BUCKETS: Bucket[] = ['major', 'olamot', 'general'];
const STATUSES: CourseStatus[] = ['done', 'now'];
const HEBREW: HebrewStatus[] = ['required', 'exempt', 'done'];
const HEBREW_ROUTES = ['bagrut', 'academic', 'preAcademic', 'exam', 'ba'] as const;
const YEARS = [1, 2, 3, 4] as const;

const SOURCES = ['https://olamot.biu.ac.il/', 'https://efl.biu.ac.il/', 'https://hebrew.biu.ac.il/'];

const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function DegreeDialog(props: { plan: Plan; courses: ReadonlyMap<string, Course>; onClose: () => void }) {
  const { plan, courses, onClose } = props;
  const { t } = useI18n();
  const [state, setState] = useState<DegreeState>(loadDegree);
  const [tab, setTab] = useState<Tab>('overview');
  const dialogRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const baseId = useId();

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Сохраняем каждое изменение (кроме самого открытия).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    write(KEYS.degree, state);
  }, [state]);

  const update: Update = (fn) => setState((s) => fn(s));
  const progress = useMemo(() => degreeProgress(state), [state]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal dg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="slot-head">
          <div>
            <span className="pick-label">{t('degree.label')}</span>
            <strong id={`${baseId}-title`} className="slot-time">
              {t('degree.title')}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <div className="dg-tabbar">
          <div className="sem-tabs" role="tablist" aria-label={t('degree.tabs')}>
            {TABS.map((id) => (
              <button
                key={id}
                id={`${baseId}-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`${baseId}-panel`}
                className={tab === id ? 'on' : ''}
                onClick={() => setTab(id)}
              >
                {t(`degree.tab.${id}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>

        <div
          className="modal-body dg-body"
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab}`}
        >
          {tab === 'overview' && (
            <Overview state={state} progress={progress} update={update} onTab={setTab} />
          )}
          {tab === 'settings' && <Settings state={state} update={update} />}
          {tab === 'courses' && <Courses state={state} update={update} plan={plan} catalog={courses} />}

          <p className="muted small dg-note">
            {t('degree.note')}{' '}
            {SOURCES.map((url, i) => (
              <span key={url}>
                {i > 0 && ' · '}
                <a href={url} target="_blank" rel="noopener">
                  {new URL(url).hostname}
                </a>
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Обзор ---------- */

function Overview({
  state,
  progress,
  update,
  onTab,
}: {
  state: DegreeState;
  progress: DegreeProgress;
  update: Update;
  onTab: (tab: Tab) => void;
}) {
  const { t, num } = useI18n();
  const { total, major, olamot, general, english } = progress;
  const sum = total.done + total.now;
  const pct = total.target > 0 ? Math.min(100, Math.round((sum / total.target) * 100)) : 100;
  const left = Math.max(0, total.target - sum);

  const toggleStep = (level: StepLevel) =>
    update((s) => ({
      ...s,
      englishDone: s.englishDone.includes(level) ? s.englishDone.filter((l) => l !== level) : [...s.englishDone, level],
    }));

  return (
    <>
      {progress.complete && (
        <div className="dg-complete" role="status">
          <strong>{t('degree.completeTitle')}</strong>
          <span>{t('degree.complete')}</span>
        </div>
      )}

      <section className="dg-card dg-total">
        <div className="dg-total-head">
          <h3>{t('degree.total')}</h3>
          <span className="dg-pct">{num(pct)}%</span>
        </div>
        <p className="dg-total-sum">{rich(t('degree.totalSummary', { sum: num(sum, 1), target: num(total.target, 1) }))}</p>
        <Bar p={total} label={t('degree.total')} big />
        <p className="dg-legend small">
          <span className="dg-key dg-key-done">{t('degree.legend.done', { n: num(total.done, 1) })}</span>
          <span className="dg-key dg-key-now">{t('degree.legend.now', { n: num(total.now, 1) })}</span>
          <span className="dg-key">{t('degree.legend.left', { n: num(left, 1) })}</span>
        </p>
        {state.courses.length === 0 && (
          <p className="muted small">
            {t('degree.empty')}{' '}
            <button type="button" className="link-btn" onClick={() => onTab('courses')}>
              {t('degree.tab.courses')}
            </button>
          </p>
        )}
      </section>

      <div className="dg-grid">
        <section className="dg-card">
          {major ? (
            <BucketRow title={t('degree.major')} p={major} />
          ) : (
            <>
              <h3>{t('degree.major')}</h3>
              <p className="muted small">
                {t('degree.majorHint')}{' '}
                <button type="button" className="link-btn" onClick={() => onTab('settings')}>
                  {t('degree.tab.settings')}
                </button>
              </p>
            </>
          )}
        </section>

        <section className="dg-card">
          {general ? (
            <>
              <BucketRow title={t('degree.general')} p={general} />
              <p className="muted small">{t('degree.generalHint')}</p>
            </>
          ) : (
            <BucketRow title={t('degree.olamot')} p={olamot} />
          )}
        </section>

        <section className="dg-card">
          <h3>{t('degree.english')}</h3>
          {english.steps.length === 0 ? (
            <p className="dg-ok small">{t('degree.englishExempt')}</p>
          ) : (
            <ol className="dg-chain">
              {english.steps.map((s, i) => {
                const name = t(`degree.level.${s.level}` as MessageKey);
                return (
                  <li key={s.level}>
                    {i > 0 && <span className="dg-chain-sep" aria-hidden="true" />}
                    <button
                      type="button"
                      className={`chip chip-btn dg-step${s.done ? ' on' : ''}`}
                      aria-pressed={s.done}
                      aria-label={t(s.done ? 'degree.stepDone' : 'degree.stepTodo', { level: name })}
                      onClick={() => toggleStep(s.level)}
                    >
                      {s.done && <span aria-hidden="true">✓ </span>}
                      {name}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          {english.steps.length > 0 && english.steps.every((s) => s.done) && (
            <p className="dg-ok small">{t('degree.englishDone')}</p>
          )}
          <p className="small">
            <span className="muted">{t('degree.emi')}: </span>
            {english.emi.target === 0 ? (
              <span className="muted">{t('degree.emiNone')}</span>
            ) : (
              <span className={english.emi.done >= english.emi.target ? 'dg-ok' : ''}>
                {t('degree.emiCount', { done: english.emi.done, target: english.emi.target })}
                {english.emi.now > 0 && ` · ${t('degree.emiNow', { n: english.emi.now })}`}
              </span>
            )}
          </p>
        </section>

        <section className="dg-card">
          <h3>{t('degree.hebrew')}</h3>
          <p className={`small ${progress.hebrewDone ? 'dg-ok' : ''}`}>
            {progress.hebrewDone && <span aria-hidden="true">✓ </span>}
            {t(`degree.hebrewState.${state.hebrew}` as MessageKey)}
          </p>
        </section>
      </div>

      {progress.warnings.length > 0 && (
        <ul className="dg-warnings">
          {progress.warnings.map((w) => (
            <li key={w}>{warningText(w, state, progress, t, num)}</li>
          ))}
        </ul>
      )}

      <p className="muted small">{t('degree.notCounted', { total: num(state.total, 1) })}</p>
    </>
  );
}

function warningText(
  w: DegreeWarning,
  state: DegreeState,
  progress: DegreeProgress,
  t: ReturnType<typeof useI18n>['t'],
  num: ReturnType<typeof useI18n>['num'],
): string {
  switch (w) {
    case 'olamotYearCap':
      return t('degree.warn.olamotYearCap', {
        year: state.year,
        cap: OLAMOT_YEAR_CAP[state.year] ?? 0,
        have: num(progress.olamot.done + progress.olamot.now, 1),
      });
    case 'overTotal':
      return t('degree.warn.overTotal', {
        over: num(progress.total.done + progress.total.now - progress.total.target, 1),
        target: num(progress.total.target, 1),
      });
    default:
      return t(`degree.warn.${w}` as MessageKey);
  }
}

function BucketRow({ title, p }: { title: string; p: BucketProgress }) {
  const { t, num } = useI18n();
  return (
    <>
      <div className="dg-row-head">
        <h3>{title}</h3>
        {p.target === 0 ? (
          <span className="chip dg-badge-ok">{t('degree.exempt')}</span>
        ) : (
          <span className="small">
            <strong>{num(p.done + p.now, 1)}</strong>
            <span className="muted"> / {num(p.target, 1)}</span>
          </span>
        )}
      </div>
      {p.target > 0 && <Bar p={p} label={title} />}
    </>
  );
}

function Bar({ p, label, big }: { p: BucketProgress; label: string; big?: boolean }) {
  const { t, num } = useI18n();
  const share = (x: number) => (p.target > 0 ? Math.min(100, (x / p.target) * 100) : 100);
  const done = share(p.done);
  const now = Math.min(100 - done, share(p.now));
  return (
    <div
      className={`dg-bar${big ? ' dg-bar-big' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={p.target}
      aria-valuenow={Math.min(p.done, p.target)}
      aria-valuetext={t('degree.barAria', { done: num(p.done, 1), now: num(p.now, 1), target: num(p.target, 1) })}
    >
      <span className="dg-bar-done" style={{ inlineSize: `${done}%` }} />
      <span className="dg-bar-now" style={{ inlineSize: `${now}%` }} />
    </div>
  );
}

/* ---------- Настройки ---------- */

function Settings({ state, update }: { state: DegreeState; update: Update }) {
  const { t } = useI18n();
  const id = useId();
  const [score, setScore] = useState('');
  const scoreNum = score.trim() === '' ? null : Number(score);
  const suggested = scoreNum !== null && Number.isFinite(scoreNum) ? englishLevelForScore(scoreNum) : null;
  const set = (patch: Partial<DegreeState>) => update((s) => ({ ...s, ...patch }));

  const trackLabel = (track: OlamotTrack): string => {
    const name = t(`degree.track.${track}` as MessageKey);
    if (track === 'custom' || track === 'exempt') return name;
    const n = track === 'nonJewish' ? NON_JEWISH_GENERAL : OLAMOT_TRACKS[track];
    return `${name} — ${t('common.credits', { n })}`;
  };

  const steps = englishSteps(state.englishLevel);

  return (
    <div className="dg-settings">
      <fieldset className="dg-card">
        <legend>{t('degree.set.general')}</legend>
        <div className="dg-fields">
          <Field id={`${id}-total`} label={t('degree.set.total')} hint={t('degree.set.totalHint')}>
            <NumField
              id={`${id}-total`}
              describedBy={`${id}-total-hint`}
              value={state.total}
              min={1}
              max={400}
              onChange={(v) => v !== null && set({ total: v })}
            />
          </Field>
          <Field id={`${id}-major`} label={t('degree.set.major')} hint={t('degree.set.majorHint')}>
            <NumField
              id={`${id}-major`}
              describedBy={`${id}-major-hint`}
              value={state.majorTarget}
              allowEmpty
              max={400}
              onChange={(v) => set({ majorTarget: v })}
            />
          </Field>
          <Field id={`${id}-year`} label={t('degree.set.year')}>
            <select
              id={`${id}-year`}
              className="dg-input"
              value={state.year}
              onChange={(e) => set({ year: Number(e.target.value) as DegreeState['year'] })}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {t('degree.set.yearOption', { n: y })}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="dg-card">
        <legend>{t('degree.set.olamot')}</legend>
        <select
          className="dg-input"
          aria-label={t('degree.set.olamot')}
          value={state.olamotTrack}
          onChange={(e) => set({ olamotTrack: e.target.value as OlamotTrack })}
        >
          {TRACKS.map((tr) => (
            <option key={tr} value={tr}>
              {trackLabel(tr)}
            </option>
          ))}
        </select>
        <p className="small">{t(`degree.trackHint.${state.olamotTrack}` as MessageKey)}</p>
        {state.olamotTrack === 'custom' && (
          <Field id={`${id}-olamot`} label={t('degree.set.olamotCustom')}>
            <NumField
              id={`${id}-olamot`}
              value={state.olamotCustom}
              max={20}
              onChange={(v) => v !== null && set({ olamotCustom: v })}
            />
          </Field>
        )}
        {state.olamotTrack !== 'exempt' && state.olamotTrack !== 'nonJewish' && (
          <ul className="dg-facts muted small">
            <li>{t('degree.set.olamotPace')}</li>
            <li>{t('degree.set.olamotRules')}</li>
          </ul>
        )}
      </fieldset>

      <fieldset className="dg-card">
        <legend>{t('degree.set.english')}</legend>
        <div className="dg-fields">
          <Field
            id={`${id}-score`}
            label={t('degree.set.englishScore')}
            live
            hint={
              suggested
                ? t('degree.set.suggested', { level: t(`degree.level.${suggested}` as MessageKey) })
                : scoreNum !== null && score.trim().length >= 2 && scoreNum < 70
                  ? t('degree.set.belowScale')
                  : t('degree.set.englishScoreHint')
            }
          >
            <input
              id={`${id}-score`}
              className="dg-input dg-num"
              type="number"
              inputMode="numeric"
              min={50}
              max={150}
              value={score}
              aria-describedby={`${id}-score-hint`}
              onChange={(e) => {
                const text = e.target.value;
                setScore(text);
                const n = Number(text);
                const level = text.trim() !== '' && Number.isFinite(n) ? englishLevelForScore(n) : null;
                if (level) set({ englishLevel: level });
              }}
            />
          </Field>
          <Field id={`${id}-level`} label={t('degree.set.level')}>
            <select
              id={`${id}-level`}
              className="dg-input"
              value={state.englishLevel}
              onChange={(e) => set({ englishLevel: e.target.value as EnglishLevel })}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {`${t(`degree.level.${l}` as MessageKey)} · ${LEVEL_RANGE[l]}`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="dg-subhead">{t('degree.set.finished')}</div>
        {steps.length === 0 ? (
          <p className="dg-ok small">{t('degree.set.englishExempt')}</p>
        ) : (
          <div className="dg-checks">
            {steps.map((level) => (
              <label key={level} className="dg-check">
                <input
                  type="checkbox"
                  checked={state.englishDone.includes(level)}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      englishDone: e.target.checked
                        ? [...s.englishDone.filter((l) => l !== level), level]
                        : s.englishDone.filter((l) => l !== level),
                    }))
                  }
                />
                {t(`degree.level.${level}` as MessageKey)}
              </label>
            ))}
          </div>
        )}
        <ul className="dg-facts muted small">
          <li>{t('degree.set.englishDeadline')}</li>
          <li>{t('degree.set.englishOther')}</li>
          <li>{t('degree.set.emiNote')}</li>
        </ul>
      </fieldset>

      <fieldset className="dg-card">
        <legend>{t('degree.set.hebrew')}</legend>
        <div className="dg-checks" role="radiogroup" aria-label={t('degree.set.hebrew')}>
          {HEBREW.map((h) => (
            <label key={h} className="dg-check">
              <input
                type="radio"
                name={`${id}-hebrew`}
                value={h}
                checked={state.hebrew === h}
                onChange={() => set({ hebrew: h })}
              />
              {t(`degree.hebrewOpt.${h}` as MessageKey)}
            </label>
          ))}
        </div>
        <details className="dg-details">
          <summary>{t('degree.set.hebrewRoutes')}</summary>
          <ul className="dg-facts small">
            {HEBREW_ROUTES.map((r) => (
              <li key={r}>{t(`degree.route.${r}` as MessageKey)}</li>
            ))}
            <li>{t('degree.route.yael')}</li>
          </ul>
        </details>
      </fieldset>
    </div>
  );
}

/** Подпись над полем и подсказка под ним (подсказка — id `${id}-hint`, для aria-describedby). */
function Field({
  id,
  label,
  hint,
  live = false,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  live?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`dg-field${wide ? ' dg-field-wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint !== undefined && (
        <span id={`${id}-hint`} className="muted small" aria-live={live ? 'polite' : undefined}>
          {hint}
        </span>
      )}
    </div>
  );
}

/** Числовое поле: пока вводите, держит свой текст; наружу отдаёт только корректное число. */
function NumField({
  id,
  describedBy,
  value,
  onChange,
  allowEmpty = false,
  min = 0,
  max,
  step = 1,
}: {
  id: string;
  describedBy?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  const format = (v: number | null) => (v === null ? '' : String(v));
  const parse = (text: string): number | null | undefined => {
    if (text.trim() === '') return allowEmpty ? null : undefined;
    const n = Number(text);
    if (!Number.isFinite(n) || n < min || (max !== undefined && n > max)) return undefined;
    return n;
  };
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    // Внешнее значение поменялось не из-за ввода — показать его.
    setText((prev) => (parse(prev) === value ? prev : format(value)));
  }, [value]);

  return (
    <input
      id={id}
      className="dg-input dg-num"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={text}
      aria-describedby={describedBy}
      aria-invalid={parse(text) === undefined}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if (v !== undefined) onChange(v);
      }}
      onBlur={() => setText(format(value))}
    />
  );
}

/* ---------- Курсы ---------- */

function Courses({
  state,
  update,
  plan,
  catalog,
}: {
  state: DegreeState;
  update: Update;
  plan: Plan;
  catalog: ReadonlyMap<string, Course>;
}) {
  const { t, num } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const list = state.courses;
  const sumDone = list.filter((c) => c.status === 'done').reduce((s, c) => s + c.credits, 0);
  const sumNow = list.filter((c) => c.status === 'now').reduce((s, c) => s + c.credits, 0);

  const save = (course: DegreeCourse) => {
    update((s) => ({
      ...s,
      courses: s.courses.some((c) => c.id === course.id)
        ? s.courses.map((c) => (c.id === course.id ? course : c))
        : [...s.courses, course],
    }));
    setEditing(null);
  };

  const addFromPlan = () => {
    if (plan.courses.length === 0) {
      setNotice(t('degree.courses.noPlan'));
      return;
    }
    const ids = new Set(list.map((c) => c.id));
    const names = new Set(list.map((c) => c.name.trim().toLowerCase()));
    const added: DegreeCourse[] = [];
    for (const pc of plan.courses) {
      const course = catalog.get(pc.courseId);
      if (!course) continue;
      const id = `plan-${course.courseId}`;
      const name = course.name.trim().toLowerCase();
      if (ids.has(id) || names.has(name)) continue;
      ids.add(id);
      names.add(name);
      added.push({ id, name: course.name, credits: course.credits ?? 0, bucket: 'major', status: 'now' });
    }
    if (added.length === 0) {
      setNotice(t('degree.courses.nothingNew'));
      return;
    }
    update((s) => ({ ...s, courses: [...s.courses, ...added] }));
    setNotice(t('degree.courses.added', { n: added.length }));
  };

  return (
    <>
      <div className="dg-toolbar">
        <button type="button" className="btn btn-small" onClick={() => setEditing('new')} disabled={editing === 'new'}>
          + {t('degree.courses.add')}
        </button>
        <button type="button" className="btn btn-quiet btn-small" onClick={addFromPlan}>
          {t('degree.courses.fromPlan')}
        </button>
      </div>
      <p className="small" role="status" aria-live="polite">
        {notice}
      </p>

      {editing === 'new' && (
        <CourseEditor
          course={{ id: newId(), name: '', credits: 2, bucket: 'major', status: 'now' }}
          isNew
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {list.length === 0 && editing !== 'new' ? (
        <p className="empty">{t('degree.courses.empty')}</p>
      ) : (
        <>
          {list.length > 0 && (
            <p className="muted small">
              {t('degree.courses.sum', { done: num(sumDone, 1), now: num(sumNow, 1) })}
            </p>
          )}
          <ul className="dg-courses">
            {list.map((c) =>
              editing === c.id ? (
                <li key={c.id}>
                  <CourseEditor course={c} onSave={save} onCancel={() => setEditing(null)} />
                </li>
              ) : (
                <li key={c.id} className={`dg-course${c.status === 'done' ? ' is-done' : ''}`}>
                  <label className="dg-done-check">
                    <input
                      type="checkbox"
                      checked={c.status === 'done'}
                      onChange={(e) => save({ ...c, status: e.target.checked ? 'done' : 'now' })}
                    />
                    <span className="small">{t('degree.status.done')}</span>
                  </label>
                  <span className="dg-course-text">
                    <span className="result-name">{c.name}</span>
                    <span className="dg-course-meta">
                      {c.credits > 0 ? (
                        <span className="chip">{t('common.credits', { n: c.credits })}</span>
                      ) : (
                        <span className="chip chip-missing">{t('degree.courses.noCredits')}</span>
                      )}
                      <span className={`chip dg-bucket dg-bucket-${c.bucket}`}>
                        {t(`degree.bucket.${c.bucket}` as MessageKey)}
                      </span>
                      {c.status === 'now' && <span className="chip">{t('degree.status.now')}</span>}
                      {c.emi && <span className="chip">{t('degree.courses.emiTag')}</span>}
                    </span>
                  </span>
                  <span className="dg-course-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setEditing(c.id)}
                      aria-label={t('degree.courses.edit', { name: c.name })}
                      title={t('degree.courses.edit', { name: c.name })}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => update((s) => ({ ...s, courses: s.courses.filter((x) => x.id !== c.id) }))}
                      aria-label={t('degree.courses.delete', { name: c.name })}
                      title={t('degree.courses.delete', { name: c.name })}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </>
  );
}

function CourseEditor({
  course,
  isNew = false,
  onSave,
  onCancel,
}: {
  course: DegreeCourse;
  isNew?: boolean;
  onSave: (course: DegreeCourse) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [draft, setDraft] = useState<DegreeCourse>(course);
  const nameRef = useRef<HTMLInputElement>(null);
  const valid = draft.name.trim() !== '';

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const { emi, ...rest } = draft;
    onSave({ ...rest, name: draft.name.trim(), ...(emi ? { emi: true } : {}) });
  };

  return (
    <form
      className="dg-editor"
      aria-label={isNew ? t('degree.courses.new') : t('degree.courses.edit', { name: course.name })}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <label className="dg-field dg-field-wide" htmlFor={`${id}-name`}>
        <span>{t('degree.courses.name')}</span>
        <input
          ref={nameRef}
          id={`${id}-name`}
          className="dg-input"
          value={draft.name}
          maxLength={120}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label className="dg-field" htmlFor={`${id}-credits`}>
        <span>{t('degree.courses.credits')}</span>
        <NumField
          id={`${id}-credits`}
          value={draft.credits}
          max={40}
          step={0.5}
          onChange={(v) => v !== null && setDraft((d) => ({ ...d, credits: v }))}
        />
      </label>
      <label className="dg-field" htmlFor={`${id}-bucket`}>
        <span>{t('degree.courses.bucket')}</span>
        <select
          id={`${id}-bucket`}
          className="dg-input"
          value={draft.bucket}
          onChange={(e) => setDraft({ ...draft, bucket: e.target.value as Bucket })}
        >
          {BUCKETS.map((b) => (
            <option key={b} value={b}>
              {t(`degree.bucket.${b}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="dg-field" htmlFor={`${id}-status`}>
        <span>{t('degree.courses.status')}</span>
        <select
          id={`${id}-status`}
          className="dg-input"
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as CourseStatus })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`degree.status.${s}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="dg-check dg-field-wide">
        <input
          type="checkbox"
          checked={Boolean(draft.emi)}
          onChange={(e) => setDraft({ ...draft, emi: e.target.checked })}
        />
        {t('degree.courses.emi')}
      </label>
      <div className="modal-actions dg-field-wide">
        <button type="button" className="btn btn-quiet btn-small" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn btn-small" disabled={!valid}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}
