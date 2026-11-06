import { useEffect, useMemo, useRef, useState } from 'react';
import { DAYS, type Course, type Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import { autoPick, type AutoPickOutcome, type AutoPickResult } from '../logic/autopick';
import { weeklyCommuteHours } from '../logic/load';
import { computeMisery, MISERY_WEIGHTS, pickTitle, type MiseryWeights } from '../logic/misery';
import { collectMeetings, termIncludes, type TimeSpan } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import { rich } from './ImportDialog';
import { GRID_END, GRID_START } from './WeekGrid';

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  semester: Semester;
  weights: MiseryWeights;
  onWeights: (weights: MiseryWeights) => void;
  /** Личные блокировки семестра — автоподбор их обходит. */
  blocked: TimeSpan[];
  commuteMinutes: number;
  onSetRequired: (courseId: string, required: boolean) => void;
  onApply: (result: AutoPickResult) => void;
  onClose: () => void;
}

const WEIGHT_KEYS: (keyof MiseryWeights)[] = ['campusDay', 'earlyClass', 'windowHour', 'friday', 'lateClass'];

const isDefault = (w: MiseryWeights) =>
  (Object.keys(MISERY_WEIGHTS) as (keyof MiseryWeights)[]).every((k) => w[k] === MISERY_WEIGHTS[k]);

export function AutoPickDialog(props: Props) {
  const { plan, courses, semester, weights, onSetRequired, onApply, onClose } = props;
  const { t, term } = useI18n();
  const [outcome, setOutcome] = useState<AutoPickOutcome | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Курсы плана, которые идут в этом семестре.
  const candidates = plan.courses
    .map((pc) => ({ pc, course: courses.get(pc.courseId) }))
    .filter((x): x is { pc: (typeof plan.courses)[number]; course: Course } =>
      x.course !== undefined && termIncludes(x.course.term, semester),
    );
  const required = candidates.filter((c) => c.pc.required);
  const optional = candidates.filter((c) => !c.pc.required);
  const [optionalToTake, setOptionalToTake] = useState(optional.length);
  const take = Math.min(optionalToTake, optional.length);

  const colors = new Map(plan.courses.map((c) => [c.courseId, c.color]));
  const current = useMemo(
    () => computeMisery(collectMeetings(plan, courses, semester), weights),
    [plan, courses, semester, weights],
  );
  const custom = !isDefault(weights);
  // Открыта сразу, если веса уже свои; дальше студент сам сворачивает и разворачивает.
  const [weightsOpen, setWeightsOpen] = useState(custom);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [outcome === null]);

  const run = () => {
    setOutcome(
      autoPick({
        courses: candidates.map((c) => c.course),
        required: new Set(required.map((c) => c.course.courseId)),
        optionalToTake: take,
        semester,
        weights,
        blocked: props.blocked,
      }),
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="autopick-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slot-head">
          <div>
            <span className="pick-label">{t('autopick.label', { sem: term(semester) })}</span>
            <strong id="autopick-title" className="slot-time">
              {t(outcome ? 'autopick.titleResults' : 'autopick.titleRequired')}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        {outcome === null ? (
          <div className="modal-body">
            {candidates.length === 0 ? (
              <p className="empty">{t('autopick.noCandidates')}</p>
            ) : (
              <>
                <p className="muted small">{rich(t('autopick.intro'))}</p>
                <ul className="req-list">
                  {candidates.map(({ pc, course }) => (
                    <li key={pc.courseId} className={`req-item c${pc.color}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(pc.required)}
                          onChange={(e) => onSetRequired(pc.courseId, e.target.checked)}
                        />
                        <span className="req-text">
                          <span className="result-name">{course.name}</span>
                          <span className="result-meta">
                            {course.courseId} · {term(course.term)}
                            {pc.hidden && ` · ${t('autopick.hiddenNow')}`}
                          </span>
                        </span>
                        <span className={`chip ${pc.required ? 'chip-required' : ''}`}>
                          {t(pc.required ? 'autopick.required' : 'autopick.optional')}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>

                {optional.length > 0 && (
                  <div className="stepper-row">
                    <span>{rich(t('autopick.alsoTake', { n: optional.length, take }))}</span>
                    <span className="stepper">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setOptionalToTake(Math.max(0, take - 1))}
                        disabled={take === 0}
                        aria-label={t('autopick.fewer')}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setOptionalToTake(Math.min(optional.length, take + 1))}
                        disabled={take === optional.length}
                        aria-label={t('autopick.more')}
                      >
                        +
                      </button>
                    </span>
                  </div>
                )}

                <details
                  className="weights"
                  open={weightsOpen}
                  onToggle={(e) => setWeightsOpen((e.currentTarget as HTMLDetailsElement).open)}
                >
                  <summary>
                    {t(custom ? 'autopick.weightsCustom' : 'autopick.weights')}
                    <span className="muted small"> {t('autopick.weightsHint')}</span>
                  </summary>
                  <div className="weights-body">
                    {WEIGHT_KEYS.map((key) => {
                      const label = t(`autopick.weight.${key}` as MessageKey);
                      return (
                        <label key={key} className="weight-row">
                          <span>{label}</span>
                          <input
                            type="range"
                            min={0}
                            max={30}
                            step={1}
                            value={weights[key]}
                            onChange={(e) => props.onWeights({ ...weights, [key]: Number(e.target.value) })}
                            aria-label={t('autopick.weightAria', { label })}
                          />
                          <span className="weight-value">{weights[key]}</span>
                        </label>
                      );
                    })}
                    <div className="weights-foot">
                      <span className="muted small">{t('autopick.weightsNote')}</span>
                      <button
                        type="button"
                        className="link-btn"
                        disabled={!custom}
                        onClick={() => props.onWeights({ ...MISERY_WEIGHTS })}
                      >
                        {t('common.reset')}
                      </button>
                    </div>
                  </div>
                </details>

                {props.blocked.length > 0 && (
                  <p className="muted small">{t('autopick.blocked', { n: props.blocked.length })}</p>
                )}

                {candidates.some((c) => c.course.term === 'year') && (
                  <p className="muted small">{t('autopick.yearly')}</p>
                )}

                <div className="modal-actions">
                  {required.length === 0 && <span className="hint-warn">{t('autopick.needRequired')}</span>}
                  <button type="button" className="btn" disabled={required.length === 0} onClick={run}>
                    {t('autopick.find')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="modal-body">
            <p className="muted small">
              {rich(t(custom ? 'autopick.currentCustom' : 'autopick.current', { score: current.score }))}
            </p>
            {outcome.unschedulable.length > 0 && (
              <p className="hint-warn">
                {t('autopick.unschedulable', {
                  names: outcome.unschedulable.map((id) => courses.get(id)?.name ?? id).join(', '),
                })}
              </p>
            )}
            {outcome.truncated && <p className="hint-warn">{t('autopick.truncated')}</p>}
            {outcome.results.length === 0 ? (
              <p className="empty">{t('autopick.none')}</p>
            ) : (
              <ol className="ap-results">
                {outcome.results.map((r, i) => (
                  <ResultCard
                    key={i}
                    rank={i + 1}
                    result={r}
                    courses={courses}
                    colors={colors}
                    current={current.score}
                    commuteMinutes={props.commuteMinutes}
                    onApply={() => onApply(r)}
                  />
                ))}
              </ol>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setOutcome(null)}>
                {t('autopick.back')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  rank,
  result,
  courses,
  colors,
  current,
  commuteMinutes,
  onApply,
}: {
  rank: number;
  result: AutoPickResult;
  courses: ReadonlyMap<string, Course>;
  colors: Map<string, number>;
  current: number;
  commuteMinutes: number;
  onApply: () => void;
}) {
  const { t, num } = useI18n();
  const m = result.misery;
  const title = pickTitle(m, result.spans.length);
  const delta = m.score - current;
  const facts = [
    t('common.days', { n: m.campusDays }),
    t('autopick.fact.gaps', { h: num(m.windowHours, 1) }),
    m.earlyClasses > 0 && t('autopick.fact.early', { n: m.earlyClasses }),
    m.lateClasses > 0 && t('autopick.fact.late', { n: m.lateClasses }),
    m.hasFriday && t('autopick.fact.friday'),
    commuteMinutes > 0 &&
      t('autopick.fact.road', { h: num(weeklyCommuteHours(m.campusDays, commuteMinutes), 1) }),
  ].filter(Boolean);

  return (
    <li className="ap-card">
      <div className="ap-top">
        <span className="ap-rank">#{rank}</span>
        <span className="ap-score">{m.score}</span>
        <span className="ap-title">
          <span className="misery-title">{t(`title.${title.id}` as MessageKey)}</span>
          <span className="result-meta">
            {facts.join(' · ')}
            {delta !== 0 && (
              <span className={delta < 0 ? 'ap-better' : 'ap-worse'}>
                {' '}
                {t('autopick.vsNow', { delta: `${delta > 0 ? '+' : ''}${delta}` })}
              </span>
            )}
          </span>
        </span>
        <button type="button" className="btn" onClick={onApply}>
          {t('autopick.use')}
        </button>
      </div>

      {result.conflicts > 0 && <p className="hint-warn">{t('autopick.conflicts', { n: result.conflicts })}</p>}

      <MiniWeek result={result} colors={colors} />

      {result.skipped.length > 0 && (
        <p className="result-meta">
          {t('autopick.leavesOut', { names: result.skipped.map((id) => courses.get(id)?.name ?? id).join(', ') })}
        </p>
      )}
    </li>
  );
}

/** Маленькая сетка недели для сравнения вариантов. */
function MiniWeek({ result, colors }: { result: AutoPickResult; colors: Map<string, number> }) {
  const { day } = useI18n();
  const span = GRID_END - GRID_START;
  return (
    <div className="mini-week" aria-hidden="true">
      {DAYS.map((d) => (
        <div key={d} className="mini-day">
          <span className="mini-label">{day(d)[0]}</span>
          <div className="mini-col">
            {result.spans
              .map((s, i) => ({ s, i }))
              .filter(({ s }) => s.day === d)
              .map(({ s, i }) => (
                <span
                  key={i}
                  className={`mini-block c${colors.get(result.owners[i] ?? '') ?? 0}`}
                  style={{
                    top: `${((Math.max(s.start, GRID_START) - GRID_START) / span) * 100}%`,
                    height: `${((Math.min(s.end, GRID_END) - Math.max(s.start, GRID_START)) / span) * 100}%`,
                  }}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
