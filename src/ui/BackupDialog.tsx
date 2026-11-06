import { useEffect, useRef } from 'react';
import type { Course } from '../data/types';
import type { Plan } from '../logic/selection';
import { TERM_LABEL } from './format';

interface Props {
  fileName: string;
  incoming: Plan;
  current: Plan;
  dropped: string[];
  courses: ReadonlyMap<string, Course>;
  onApply: () => void;
  onCancel: () => void;
}

/** Перед загрузкой файла расписания показываем, что в нём, и спрашиваем подтверждение. */
export function BackupDialog({ fileName, incoming, current, dropped, courses, onApply, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const blocks = incoming.blocks?.length ?? 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slot-head">
          <div>
            <span className="pick-label">Open file</span>
            <strong id="backup-title" className="slot-time">
              Load this schedule?
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            <span className="muted">{fileName}</span> has <strong>{incoming.courses.length}</strong>{' '}
            {incoming.courses.length === 1 ? 'course' : 'courses'}
            {blocks > 0 && ` and ${blocks} blocked ${blocks === 1 ? 'time' : 'times'}`}, plus your settings.
          </p>
          <ul className="import-list">
            {incoming.courses.map((c) => {
              const course = courses.get(c.courseId);
              return (
                <li key={c.courseId} className="import-ok">
                  <span aria-hidden="true">✓</span>
                  <span>
                    {course?.name ?? c.courseId}{' '}
                    <span className="muted small">
                      {c.courseId}
                      {course && ` · ${TERM_LABEL[course.term]}`} · {Object.values(c.picks).join(', ') || 'no groups yet'}
                      {c.hidden && ' · hidden'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {dropped.length > 0 && (
            <p className="hint-warn">Not in our catalog, will be skipped: {dropped.join(', ')}.</p>
          )}
          <div className="import-summary">
            <strong>What will change</strong>
            <span className="small">
              Your current schedule ({current.courses.length} {current.courses.length === 1 ? 'course' : 'courses'}) and
              settings will be replaced by this file.
            </span>
            <span className="muted small">You can undo this afterwards (Undo or Ctrl+Z).</span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={onCancel}>
              Don’t change
            </button>
            <button type="button" className="btn" onClick={onApply}>
              Apply changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
