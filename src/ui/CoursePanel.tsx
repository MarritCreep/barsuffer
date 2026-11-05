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

export function CoursePanel({ catalog, plan, activeId, onAdd, onRemove, onPick, onClear }: Props) {
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
        {plan.courses.length === 0 ? (
          <p className="empty">Nothing yet. Find a course below and add it.</p>
        ) : (
          <ul className="my-courses">
            {plan.courses.map((pc) => {
              const course = courseById.get(pc.courseId);
              if (!course) return null;
              const missing = missingTypes(course, pc.picks);
              return (
                <li
                  key={pc.courseId}
                  className={`my-course c${pc.color} ${activeId === pc.courseId ? 'active' : ''}`}
                >
                  <button type="button" className="my-course-main" onClick={() => onPick(course)}>
                    <span className="my-course-name">{course.name}</span>
                    <span className="my-course-meta">
                      {course.courseId} · {TERM_LABEL[course.term]}
                      {course.isDemo && <span className="demo-tag">DEMO</span>}
                    </span>
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
                  <button
                    type="button"
                    className="icon-btn remove"
                    onClick={() => onRemove(pc.courseId)}
                    aria-label={`Remove ${course.name}`}
                    title="Remove"
                  >
                    ×
                  </button>
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
