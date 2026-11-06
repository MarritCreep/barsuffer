import { useEffect, useMemo, useRef, useState } from 'react';
import { DAYS, DAY_LABEL, type Course, type Semester } from '../data/types';
import { autoPick, type AutoPickOutcome, type AutoPickResult } from '../logic/autopick';
import { weeklyCommuteHours } from '../logic/load';
import { computeMisery, MISERY_WEIGHTS, pickTitle, type MiseryWeights } from '../logic/misery';
import { collectMeetings, termIncludes, type TimeSpan } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import { formatHours, TERM_LABEL } from './format';
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

const WEIGHT_LABELS: [keyof MiseryWeights, string][] = [
  ['campusDay', 'Each day on campus'],
  ['earlyClass', 'Each class before 09:00'],
  ['windowHour', 'Each hour of gap'],
  ['friday', 'Classes on Friday'],
  ['lateClass', 'Each class ending after 18:00'],
];

const isDefault = (w: MiseryWeights) =>
  (Object.keys(MISERY_WEIGHTS) as (keyof MiseryWeights)[]).every((k) => w[k] === MISERY_WEIGHTS[k]);

export function AutoPickDialog(props: Props) {
  const { plan, courses, semester, weights, onSetRequired, onApply, onClose } = props;
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
            <span className="pick-label">Auto-pick · Sem {semester}</span>
            <strong id="autopick-title" className="slot-time">
              {outcome ? 'Least painful schedules' : 'Which courses can’t you skip?'}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {outcome === null ? (
          <div className="modal-body">
            {candidates.length === 0 ? (
              <p className="empty">Add this semester’s courses first, then come back.</p>
            ) : (
              <>
                <p className="muted small">
                  Mark every course you <strong>must</strong> take this semester. Auto-pick always includes them
                  and only chooses their groups. Unmarked courses are optional — it may leave some out.
                </p>
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
                            {course.courseId} · {TERM_LABEL[course.term]}
                            {pc.hidden && ' · hidden now'}
                          </span>
                        </span>
                        <span className={`chip ${pc.required ? 'chip-required' : ''}`}>
                          {pc.required ? 'Required' : 'Optional'}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>

                {optional.length > 0 && (
                  <div className="stepper-row">
                    <span>
                      Also take <strong>{take}</strong> of {optional.length} optional
                      {optional.length === 1 ? ' course' : ' courses'}
                    </span>
                    <span className="stepper">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setOptionalToTake(Math.max(0, take - 1))}
                        disabled={take === 0}
                        aria-label="Take fewer optional courses"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setOptionalToTake(Math.min(optional.length, take + 1))}
                        disabled={take === optional.length}
                        aria-label="Take more optional courses"
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
                    Your suffering weights{custom ? ' (custom)' : ''}
                    <span className="muted small"> — what hurts you most?</span>
                  </summary>
                  <div className="weights-body">
                    {WEIGHT_LABELS.map(([key, label]) => (
                      <label key={key} className="weight-row">
                        <span>{label}</span>
                        <input
                          type="range"
                          min={0}
                          max={30}
                          step={1}
                          value={weights[key]}
                          onChange={(e) => props.onWeights({ ...weights, [key]: Number(e.target.value) })}
                          aria-label={`${label}: points`}
                        />
                        <span className="weight-value">{weights[key]}</span>
                      </label>
                    ))}
                    <div className="weights-foot">
                      <span className="muted small">
                        Used only for auto-pick. The index on the main screen stays standard, so friends can compare.
                      </span>
                      <button
                        type="button"
                        className="link-btn"
                        disabled={!custom}
                        onClick={() => props.onWeights({ ...MISERY_WEIGHTS })}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </details>

                {props.blocked.length > 0 && (
                  <p className="muted small">
                    Your {props.blocked.length} blocked {props.blocked.length === 1 ? 'time' : 'times'} count as
                    conflicts, so auto-pick avoids them.
                  </p>
                )}

                {candidates.some((c) => c.course.term === 'year') && (
                  <p className="muted small">Yearly courses: the groups chosen here apply to both semesters.</p>
                )}

                <div className="modal-actions">
                  {required.length === 0 && (
                    <span className="hint-warn">Mark at least one required course to continue.</span>
                  )}
                  <button type="button" className="btn" disabled={required.length === 0} onClick={run}>
                    Find best schedules
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="modal-body">
            <p className="muted small">
              Your current schedule scores <strong>{current.score}</strong>
              {custom && ' with your weights'}. Conflict-free options always come first.
            </p>
            {outcome.unschedulable.length > 0 && (
              <p className="hint-warn">
                Can’t build a valid group combination for: {outcome.unschedulable.map((id) => courses.get(id)?.name ?? id).join(', ')}.
              </p>
            )}
            {outcome.truncated && (
              <p className="hint-warn">Too many combinations — showing the best found so far.</p>
            )}
            {outcome.results.length === 0 ? (
              <p className="empty">No schedule found.</p>
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
                ← Change required courses
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
  const m = result.misery;
  const title = pickTitle(m, result.spans.length);
  const delta = m.score - current;
  const facts = [
    `${m.campusDays} ${m.campusDays === 1 ? 'day' : 'days'}`,
    `${m.windowHours}h gaps`,
    m.earlyClasses > 0 && `${m.earlyClasses} before 9`,
    m.lateClasses > 0 && `${m.lateClasses} after 18`,
    m.hasFriday && 'Friday',
    commuteMinutes > 0 && `${formatHours(weeklyCommuteHours(m.campusDays, commuteMinutes))}h on the road`,
  ].filter(Boolean);

  return (
    <li className="ap-card">
      <div className="ap-top">
        <span className="ap-rank">#{rank}</span>
        <span className="ap-score">{m.score}</span>
        <span className="ap-title">
          <span className="misery-title">{title.title}</span>
          <span className="result-meta">
            {facts.join(' · ')}
            {delta !== 0 && (
              <span className={delta < 0 ? 'ap-better' : 'ap-worse'}>
                {' '}
                ({delta > 0 ? '+' : ''}
                {delta} vs now)
              </span>
            )}
          </span>
        </span>
        <button type="button" className="btn" onClick={onApply}>
          Use this
        </button>
      </div>

      {result.conflicts > 0 && (
        <p className="hint-warn">
          {result.conflicts} {result.conflicts === 1 ? 'conflict' : 'conflicts'} — no conflict-free option exists
        </p>
      )}

      <MiniWeek result={result} colors={colors} />

      {result.skipped.length > 0 && (
        <p className="result-meta">Leaves out: {result.skipped.map((id) => courses.get(id)?.name ?? id).join(', ')}</p>
      )}
    </li>
  );
}

/** Маленькая сетка недели для сравнения вариантов. */
function MiniWeek({ result, colors }: { result: AutoPickResult; colors: Map<string, number> }) {
  const span = GRID_END - GRID_START;
  return (
    <div className="mini-week" aria-hidden="true">
      {DAYS.map((d) => (
        <div key={d} className="mini-day">
          <span className="mini-label">{DAY_LABEL[d][0]}</span>
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
