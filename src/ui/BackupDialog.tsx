import { useEffect, useRef } from 'react';
import type { Course } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { Plan } from '../logic/selection';
import { rich } from './ImportDialog';

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
  const { t, term } = useI18n();
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
            <span className="pick-label">{t('courses.openFile')}</span>
            <strong id="backup-title" className="slot-time">
              {t('backup.title')}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>
            {rich(
              t('backup.has', {
                n: incoming.courses.length,
                blocks: blocks > 0 ? t('backup.andBlocks', { n: blocks }) : '',
              }),
              { file: <span className="muted">{fileName}</span> },
            )}
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
                      {course && ` · ${term(course.term)}`} · {Object.values(c.picks).join(', ') || t('backup.noGroups')}
                      {c.hidden && ` · ${t('backup.hidden')}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {dropped.length > 0 && <p className="hint-warn">{t('backup.dropped', { ids: dropped.join(', ') })}</p>}
          <div className="import-summary">
            <strong>{t('import.whatChanges')}</strong>
            <span className="small">{t('backup.replaced', { n: current.courses.length })}</span>
            <span className="muted small">{t('import.undoHint')}</span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={onCancel}>
              {t('import.dontChange')}
            </button>
            <button type="button" className="btn" onClick={onApply}>
              {t('import.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
