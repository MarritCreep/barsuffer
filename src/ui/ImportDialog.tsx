import { useEffect, useRef, useState } from 'react';
import type { Course, Semester } from '../data/types';
import {
  applyImport,
  buildImport,
  parseInbarPdf,
  type ImportPlan,
  type ImportScope,
  type InbarImport,
  type PdfPage,
} from '../logic/inbar';
import type { Plan } from '../logic/selection';
import { readPdf } from './readPdf';

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  onApply: (next: Plan) => void;
  onClose: () => void;
}

type State =
  | { step: 'pick' }
  | { step: 'reading' }
  | { step: 'error'; message: string }
  | {
      step: 'preview';
      pages: PdfPage[];
      parsed: InbarImport;
      imp: ImportPlan;
      fileName: string;
      /** Распечатка без подписи семестра — студент выбирает сам. */
      askSemester: boolean;
    };

const SCOPE_LABEL: Record<ImportScope, string> = {
  A: 'Semester A',
  B: 'Semester B',
  year: 'the whole year',
  unknown: 'an unknown semester',
};

/** Импорт расписания из PDF Инбара. Файл читается в браузере и никуда не отправляется. */
export function ImportDialog({ plan, courses, onApply, onClose }: Props) {
  const [state, setState] = useState<State>({ step: 'pick' });
  const [mode, setMode] = useState<'replace' | 'add'>(plan.courses.length > 0 ? 'add' : 'replace');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => dialogRef.current?.focus(), []);

  const preview = (pages: PdfPage[], fileName: string, fallback?: Semester, askSemester = false) => {
    const parsed = parseInbarPdf(pages, { fallbackSemester: fallback });
    if (parsed.meetings.length === 0 && parsed.untimed.length === 0) {
      setState({ step: 'error', message: parsed.warnings[0] ?? 'No classes found in this PDF.' });
      return;
    }
    if (parsed.scope === 'unknown') {
      // Нет подписи семестра — по умолчанию A, студент может переключить.
      preview(pages, fileName, 'A', true);
      return;
    }
    setState({ step: 'preview', pages, parsed, imp: buildImport(parsed, courses), fileName, askSemester });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setState({ step: 'reading' });
    try {
      preview(await readPdf(file), file.name);
    } catch {
      setState({ step: 'error', message: 'Could not read this file. Is it the PDF exported from Inbar?' });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slot-head">
          <div>
            <span className="pick-label">Import</span>
            <strong id="import-title" className="slot-time">
              Your schedule from Inbar
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {(state.step === 'pick' || state.step === 'error' || state.step === 'reading') && (
            <>
              <ol className="import-steps">
                <li>
                  Open Inbar → <strong>Schedule</strong> (English version) and pick <strong>1st Semester</strong>,{' '}
                  <strong>2nd Semester</strong> or <strong>All Semesters</strong>.
                </li>
                <li>Export or print the page as <strong>PDF</strong>.</li>
                <li>Upload that PDF here.</li>
              </ol>
              <p className="muted small">
                The file is read right here in your browser and never sent anywhere. BarSuffer never asks for your
                Inbar password, and your name in the PDF is ignored.
              </p>
              <label className="file-drop">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                  aria-label="Inbar schedule PDF"
                  disabled={state.step === 'reading'}
                />
                <span>{state.step === 'reading' ? 'Reading the PDF…' : 'Choose PDF'}</span>
              </label>
              {state.step === 'error' && <p className="hint-warn">{state.message}</p>}
            </>
          )}

          {state.step === 'preview' && (
            <ImportPreview
              state={state}
              plan={plan}
              courses={courses}
              mode={mode}
              setMode={setMode}
              onSemester={(s) => preview(state.pages, state.fileName, s, true)}
              onApply={(next) => onApply(next)}
              onCancel={onClose}
              onBack={() => setState({ step: 'pick' })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const DAY_SHORT = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * Шаг проверки: что именно прочитано из распечатки и что изменится в плане.
 * Ничего не меняется, пока студент не нажмёт «Apply changes».
 */
function ImportPreview({
  state,
  plan,
  courses,
  mode,
  setMode,
  onSemester,
  onApply,
  onCancel,
  onBack,
}: {
  state: Extract<State, { step: 'preview' }>;
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  mode: 'replace' | 'add';
  setMode: (m: 'replace' | 'add') => void;
  onSemester: (s: Semester) => void;
  onApply: (next: Plan) => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const { imp, parsed, fileName } = state;
  const scope = parsed.scope;
  const groupCount = new Set([...parsed.meetings, ...parsed.untimed].map((g) => `${g.courseId}-${g.group}`)).size;
  const hasCourses = plan.courses.length > 0;

  // Итог: что добавится, заменится и удалится.
  const next = applyImport(plan, imp, mode, scope, courses);
  const before = new Map(plan.courses.map((c) => [c.courseId, c]));
  const after = new Set(next.courses.map((c) => c.courseId));
  const added = imp.planned.filter((p) => !before.has(p.courseId));
  const changed = imp.planned.filter((p) => {
    const old = before.get(p.courseId);
    return old && JSON.stringify(old.picks) !== JSON.stringify(p.picks);
  });
  const removed = plan.courses.filter((c) => !after.has(c.courseId));
  const nothingChanges = added.length === 0 && changed.length === 0 && removed.length === 0;
  const name = (id: string) => courses.get(id)?.name ?? id;

  const semesters = (['A', 'B'] as Semester[]).filter((s) =>
    imp.planned.some((p) => parsed.meetings.some((m) => m.courseId === p.courseId && m.semester === s) ||
      parsed.untimed.some((u) => u.courseId === p.courseId && u.semester === s)),
  );

  return (
    <>
      <p>
        Found <strong>{groupCount}</strong> {groupCount === 1 ? 'group' : 'groups'} in{' '}
        <span className="muted">{fileName}</span>.{' '}
        {state.askSemester ? '' : <span className="muted">This looks like a print of {SCOPE_LABEL[scope]}.</span>}
      </p>

      {state.askSemester && (
        <div className="import-warn">
          <strong>This PDF doesn’t say which semester it is.</strong>
          <div className="import-mode" role="radiogroup" aria-label="Semester of this PDF">
            {(['A', 'B'] as Semester[]).map((s) => (
              <label key={s}>
                <input type="radio" checked={scope === s} onChange={() => onSemester(s)} /> Semester {s}
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="import-check">
        <strong>Check that we read your print correctly</strong> — compare with Inbar before applying.
      </p>

      {semesters.map((s) => (
        <section key={s} className="import-sem" aria-label={`Semester ${s}`}>
          <h3>Semester {s}</h3>
          <ul className="import-read">
            {imp.planned.map((p) => {
              const rows = Object.values(p.picks).flatMap((group) => {
                const meets = parsed.meetings.filter((m) => m.courseId === p.courseId && m.group === group && m.semester === s);
                const untimed = parsed.untimed.some((u) => u.courseId === p.courseId && u.group === group && u.semester === s);
                if (meets.length === 0 && !untimed) return [];
                return [
                  {
                    group,
                    text: untimed
                      ? 'no fixed time'
                      : meets
                          .map((m) => `${DAY_SHORT[m.day]} ${timeLabel(m.start)}–${timeLabel(m.end)}${m.building ? ` · ${m.building}-${m.room}` : ''}`)
                          .join('; '),
                    lecturer: meets[0]?.lecturer,
                  },
                ];
              });
              if (rows.length === 0) return null;
              return (
                <li key={p.courseId}>
                  <span className="result-name">{name(p.courseId)}</span>
                  {rows.map((r) => (
                    <span key={r.group} className="result-meta">
                      {p.courseId}-{r.group} · {r.text}
                      {r.lecturer && ` · ${r.lecturer}`}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {imp.issues.length > 0 && (
        <div className="import-errors" role="alert">
          <strong>{imp.issues.length} not added — not in the BarSuffer catalog yet:</strong>
          <ul className="import-list">
            {imp.issues.map((i) => (
              <li key={`${i.courseId}-${i.group ?? ''}`} className="import-bad">
                <span aria-hidden="true">✕</span>
                <span>
                  {i.name}{' '}
                  <span className="muted small">
                    {i.courseId}
                    {i.group ? `-${i.group}` : ''} · Sem {i.semester} ·{' '}
                    {i.reason === 'unknown-course' ? 'course not in our data' : 'this group is not in our data'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Add them in Inbar as usual — BarSuffer just can’t plan around them yet.</p>
        </div>
      )}

      {imp.mismatches.length > 0 && (
        <div className="import-warn">
          <strong>Times differ from our data — check Inbar:</strong>
          <ul className="import-list">
            {imp.mismatches.map((m) => (
              <li key={`${m.courseId}-${m.group}`}>
                {m.name} {m.courseId}-{m.group}: Inbar says {m.inbar}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.warnings.length > 0 && (
        <ul className="hint-warn">
          {parsed.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {hasCourses && (
        <div className="import-mode" role="radiogroup" aria-label="Import mode">
          <label>
            <input type="radio" checked={mode === 'add'} onChange={() => setMode('add')} /> Add to my courses
          </label>
          <label>
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />{' '}
            {scope === 'A' || scope === 'B' ? `Replace my Semester ${scope} courses` : 'Replace my courses'}
          </label>
        </div>
      )}

      <div className="import-summary" aria-label="What will change">
        <strong>What will change</strong>
        {nothingChanges ? (
          <span className="muted small">Nothing — your plan already matches this print.</span>
        ) : (
          <ul className="import-list">
            {added.length > 0 && <li className="import-ok">+ {added.length} added: {added.map((p) => name(p.courseId)).join(', ')}</li>}
            {changed.length > 0 && (
              <li>~ {changed.length} switched to the groups from Inbar: {changed.map((p) => name(p.courseId)).join(', ')}</li>
            )}
            {removed.length > 0 && (
              <li className="import-bad">− {removed.length} removed: {removed.map((c) => name(c.courseId)).join(', ')}</li>
            )}
          </ul>
        )}
        <span className="muted small">You can undo this afterwards (Undo or Ctrl+Z).</span>
      </div>

      <div className="modal-actions">
        <button type="button" className="link-btn" onClick={onBack}>
          Another file
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Don’t change
        </button>
        <button type="button" className="btn" disabled={nothingChanges} onClick={() => onApply(next)}>
          Apply changes
        </button>
      </div>
    </>
  );
}

function timeLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

