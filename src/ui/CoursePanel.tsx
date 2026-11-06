import { useMemo, useState } from 'react';
import { SESSION_TYPE_LABEL, type Catalog, type Course } from '../data/types';
import { findSection, missingTypes, requiredTypes, type Plan } from '../logic/selection';
import { TERM_LABEL } from './format';

interface Props {
  catalog: Catalog;
  plan: Plan;
  activeId: string | null;
  onAdd: (course: Course) => void;
  onRemove: (courseId: string) => void;
  onPick: (course: Course) => void;
  onClear: () => void;
  onSetHidden: (courseId: string, hidden: boolean) => void;
  onImportInbar: () => void;
  onSaveFile: () => void;
  onOpenFile: (file: File) => void;
}

/** Поиск по названию, номеру курса (с дефисами или без) и преподавателю. */
export function matchCourse(course: Course, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/[\s-]/g, '');
  if (/^\d+$/.test(digits) && course.courseId.includes(digits)) return true;
  if (course.name.toLowerCase().includes(q)) return true;
  return course.sections.some((s) => s.lecturer?.toLowerCase().includes(q));
}

export function CoursePanel(props: Props) {
  const { catalog, plan, activeId, onAdd, onRemove, onPick, onClear, onSetHidden } = props;
  const [query, setQuery] = useState('');
  const planned = new Set(plan.courses.map((c) => c.courseId));
  const results = useMemo(
    () => catalog.courses.filter((c) => matchCourse(c, query)),
    [catalog.courses, query],
  );
  const courseById = useMemo(() => new Map(catalog.courses.map((c) => [c.courseId, c])), [catalog.courses]);

  return (
    <div className="course-panel">
      <div className="block">
        <div className="block-head">
          <h2>My courses</h2>
          {plan.courses.length > 0 && (
            <button type="button" className="link-btn" onClick={onClear}>
              Clear all
            </button>
          )}
        </div>
        <div className="plan-tools">
          <button type="button" className="btn btn-quiet btn-small" onClick={props.onImportInbar}>
            ⇪ Import from Inbar
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={props.onSaveFile}
            title="Download your schedule and settings as a file"
          >
            Save file
          </button>
          <label className="btn btn-quiet btn-small file-btn" title="Load a schedule file saved earlier">
            Open file
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Open a BarSuffer schedule file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) props.onOpenFile(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {plan.courses.length === 0 ? (
          <p className="empty">Nothing yet. Find a course below, or import your schedule from Inbar.</p>
        ) : (
          <ul className="my-courses">
            {plan.courses.map((pc) => {
              const course = courseById.get(pc.courseId);
              if (!course) return null;
              const missing = missingTypes(course, pc.picks);
              return (
                <li
                  key={pc.courseId}
                  className={`my-course c${pc.color} ${activeId === pc.courseId ? 'active' : ''} ${pc.hidden ? 'is-hidden' : ''}`}
                >
                  <button type="button" className="my-course-main" onClick={() => onPick(course)}>
                    <span className="my-course-name">{course.name}</span>
                    <span className="my-course-meta">
                      {course.courseId} · {TERM_LABEL[course.term]}
                      {pc.required && <span className="req-tag">REQUIRED</span>}
                      {course.isDemo && <span className="demo-tag">DEMO</span>}
                    </span>
                    {pc.hidden && <span className="hint-muted">Hidden — not on the grid, not counted</span>}
                    <span className="chips">
                      {requiredTypes(course).map((type) => {
                        const num = pc.picks[type];
                        const section = num ? findSection(course, num) : undefined;
                        return (
                          <span key={type} className={`chip ${section ? '' : 'chip-missing'}`}>
                            {SESSION_TYPE_LABEL[type]} {section ? section.sectionNumber : '—'}
                          </span>
                        );
                      })}
                    </span>
                    {missing.length > 0 && (
                      <span className="hint-warn">
                        Pick {missing.map((t) => SESSION_TYPE_LABEL[t].toLowerCase()).join(', ')}
                      </span>
                    )}
                  </button>
                  <span className="my-course-actions">
                    <button
                      type="button"
                      className="icon-btn remove"
                      onClick={() => onRemove(pc.courseId)}
                      aria-label={`Remove ${course.name}`}
                      title="Remove"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      className="icon-btn remove"
                      onClick={() => onSetHidden(pc.courseId, !pc.hidden)}
                      aria-label={pc.hidden ? `Show ${course.name}` : `Hide ${course.name}`}
                      aria-pressed={Boolean(pc.hidden)}
                      title={pc.hidden ? 'Show on the grid' : 'Hide for now'}
                    >
                      {pc.hidden ? (
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-0.4 1-1.3 2.4-2.6 3.7M6.1 6.1C4.2 7.4 2.7 9.3 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" fill="none" stroke="currentColor" strokeWidth="2" />
                          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="block">
        <h2>Find courses</h2>
        <input
          type="search"
          className="search"
          placeholder="Name, number or lecturer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search courses"
        />
        <ul className="results">
          {results.map((course) => {
            const added = planned.has(course.courseId);
            const lecturers = [...new Set(course.sections.map((s) => s.lecturer).filter(Boolean))]
              .filter((l) => !l!.startsWith('Demo'))
              .join(', ');
            return (
              <li key={course.courseId} className="result">
                <div className="result-text">
                  <span className="result-name">{course.name}</span>
                  <span className="result-meta">
                    {course.courseId} · {TERM_LABEL[course.term]} · {course.sections.length}{' '}
                    {course.sections.length === 1 ? 'group' : 'groups'}
                    {course.isDemo && <span className="demo-tag">DEMO</span>}
                  </span>
                  {lecturers && <span className="result-meta">{lecturers}</span>}
                </div>
                {added ? (
                  <button type="button" className="btn btn-quiet" onClick={() => onPick(course)}>
                    Added
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => onAdd(course)}>
                    + Add
                  </button>
                )}
              </li>
            );
          })}
          {results.length === 0 && <li className="empty">No courses match “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}
