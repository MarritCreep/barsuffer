import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Course, Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import {
  applyImport,
  buildImport,
  parseInbarPdf,
  type ImportPlan,
  type InbarImport,
  type InbarWarning,
  type PdfPage,
} from '../logic/inbar';
import type { Plan } from '../logic/selection';
import { timeRange } from './format';
import { readPdf } from './readPdf';

/**
 * Переведённая строка с разметкой → React-узлы: `<b>…</b>` — жирный, `{name}` — узел из `nodes`
 * (например, имя файла в своём span). Остальной текст остаётся как есть.
 */
export function rich(text: string, nodes: Record<string, ReactNode> = {}): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<b>(.*?)<\/b>|\{(\w+)\}/g;
  let last = 0;
  let key = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}>{rich(m[1], nodes)}</strong>);
    else if (m[2]! in nodes) out.push(<Fragment key={key++}>{nodes[m[2]!]}</Fragment>);
    else out.push(m[0]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  onApply: (next: Plan) => void;
  onClose: () => void;
}

type State =
  | { step: 'pick' }
  | { step: 'reading' }
  /** `warning` — что нашёл разбор; без него — файл вообще не прочитался. */
  | { step: 'error'; warning?: InbarWarning }
  | {
      step: 'preview';
      pages: PdfPage[];
      parsed: InbarImport;
      imp: ImportPlan;
      fileName: string;
      /** Распечатка без подписи семестра — студент выбирает сам. */
      askSemester: boolean;
    };

const NO_CLASSES: InbarWarning = { code: 'noClasses', message: 'No classes found in this PDF.' };

/** Импорт расписания из PDF Инбара. Файл читается в браузере и никуда не отправляется. */
export function ImportDialog({ plan, courses, onApply, onClose }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ step: 'pick' });
  const [mode, setMode] = useState<'replace' | 'add'>(plan.courses.length > 0 ? 'add' : 'replace');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => dialogRef.current?.focus(), []);

  const preview = (pages: PdfPage[], fileName: string, fallback?: Semester, askSemester = false) => {
    const parsed = parseInbarPdf(pages, { fallbackSemester: fallback });
    if (parsed.meetings.length === 0 && parsed.untimed.length === 0) {
      setState({ step: 'error', warning: parsed.warnings[0] ?? NO_CLASSES });
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
      setState({ step: 'error' });
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
            <span className="pick-label">{t('import.label')}</span>
            <strong id="import-title" className="slot-time">
              {t('import.title')}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {(state.step === 'pick' || state.step === 'error' || state.step === 'reading') && (
            <>
              <ol className="import-steps">
                <li>{rich(t('import.step1'))}</li>
                <li>{rich(t('import.step2'))}</li>
                <li>{t('import.step3')}</li>
              </ol>
              <p className="muted small">{t('import.privacy')}</p>
              <label className="file-drop">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                  aria-label={t('import.fileAria')}
                  disabled={state.step === 'reading'}
                />
                <span>{t(state.step === 'reading' ? 'import.reading' : 'import.choose')}</span>
              </label>
              {state.step === 'error' && (
                <p className="hint-warn">
                  {state.warning ? warningText(t, state.warning) : t('import.unreadableFile')}
                </p>
              )}
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

function warningText(t: ReturnType<typeof useI18n>['t'], w: InbarWarning): string {
  return t(`import.warn.${w.code}` as MessageKey, w.params);
}

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
  const { t, day, term } = useI18n();
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
        {rich(t('import.found', { n: groupCount }), { file: <span className="muted">{fileName}</span> })}{' '}
        {state.askSemester ? '' : <span className="muted">{t(`import.looksLike.${scope}` as MessageKey)}</span>}
      </p>

      {state.askSemester && (
        <div className="import-warn">
          <strong>{t('import.whichSemester')}</strong>
          <div className="import-mode" role="radiogroup" aria-label={t('import.semesterAria')}>
            {(['A', 'B'] as Semester[]).map((s) => (
              <label key={s}>
                <input type="radio" checked={scope === s} onChange={() => onSemester(s)} /> {term(s, 'long')}
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="import-check">{rich(t('import.check'))}</p>

      {semesters.map((s) => (
        <section key={s} className="import-sem" aria-label={term(s, 'long')}>
          <h3>{term(s, 'long')}</h3>
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
                      ? t('import.noFixedTime')
                      : meets
                          .map((m) => `${day(m.day)} ${timeRange(m.start, m.end)}${m.building ? ` · ${m.building}-${m.room}` : ''}`)
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
          <strong>{t('import.notAdded', { n: imp.issues.length })}</strong>
          <ul className="import-list">
            {imp.issues.map((i) => (
              <li key={`${i.courseId}-${i.group ?? ''}`} className="import-bad">
                <span aria-hidden="true">✕</span>
                <span>
                  {i.name}{' '}
                  <span className="muted small">
                    {i.courseId}
                    {i.group ? `-${i.group}` : ''} · {term(i.semester)} ·{' '}
                    {t(i.reason === 'unknown-course' ? 'import.unknownCourse' : 'import.unknownGroup')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('import.addInInbar')}</p>
        </div>
      )}

      {imp.mismatches.length > 0 && (
        <div className="import-warn">
          <strong>{t('import.timesDiffer')}</strong>
          <ul className="import-list">
            {imp.mismatches.map((m) => (
              <li key={`${m.courseId}-${m.group}`}>
                {t('import.inbarSays', {
                  name: m.name,
                  id: `${m.courseId}-${m.group}`,
                  times: m.times.map((x) => `${day(x.day)} ${timeRange(x.start, x.end)}`).join(', '),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.warnings.length > 0 && (
        <ul className="hint-warn">
          {parsed.warnings.map((w) => (
            <li key={w.message}>{warningText(t, w)}</li>
          ))}
        </ul>
      )}

      {hasCourses && (
        <div className="import-mode" role="radiogroup" aria-label={t('import.modeAria')}>
          <label>
            <input type="radio" checked={mode === 'add'} onChange={() => setMode('add')} /> {t('import.modeAdd')}
          </label>
          <label>
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />{' '}
            {t(scope === 'A' || scope === 'B' ? `import.modeReplace.${scope}` : 'import.modeReplace.all')}
          </label>
        </div>
      )}

      <div className="import-summary" aria-label={t('import.whatChanges')}>
        <strong>{t('import.whatChanges')}</strong>
        {nothingChanges ? (
          <span className="muted small">{t('import.nothing')}</span>
        ) : (
          <ul className="import-list">
            {added.length > 0 && (
              <li className="import-ok">
                {t('import.added', { n: added.length, names: added.map((p) => name(p.courseId)).join(', ') })}
              </li>
            )}
            {changed.length > 0 && (
              <li>{t('import.switched', { n: changed.length, names: changed.map((p) => name(p.courseId)).join(', ') })}</li>
            )}
            {removed.length > 0 && (
              <li className="import-bad">
                {t('import.removed', { n: removed.length, names: removed.map((c) => name(c.courseId)).join(', ') })}
              </li>
            )}
          </ul>
        )}
        <span className="muted small">{t('import.undoHint')}</span>
      </div>

      <div className="modal-actions">
        <button type="button" className="link-btn" onClick={onBack}>
          {t('import.another')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          {t('import.dontChange')}
        </button>
        <button type="button" className="btn" disabled={nothingChanges} onClick={() => onApply(next)}>
          {t('import.apply')}
        </button>
      </div>
    </>
  );
}
