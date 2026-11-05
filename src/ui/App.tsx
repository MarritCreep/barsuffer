import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { catalog, courseMap } from '../data/catalog';
import type { Course, Semester } from '../data/types';
import { academicHours, totalCredits } from '../logic/load';
import { computeMisery, pickTitle } from '../logic/misery';
import { collectMeetings, collectUnscheduled, findConflicts, type TimeSpan } from '../logic/schedule';
import { hourSlot, optionsForSlot } from '../logic/slots';
import { initHistory, withHistory } from '../state/history';
import { loadPlan, loadTheme, savePlan, saveTheme, type Theme } from '../state/storage';
import { AutoPickDialog } from './AutoPickDialog';
import { CoursePanel } from './CoursePanel';
import { Header } from './Header';
import { planReducer } from './planReducer';
import { SlotSheet } from './SlotSheet';
import { StatsBar } from './StatsBar';
import { WeekGrid } from './WeekGrid';

type MobileTab = 'courses' | 'week';

const planHistoryReducer = withHistory(planReducer);

/** Ctrl+Z внутри поля ввода должен отменять ввод текста, а не изменения расписания. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

export function App() {
  const [history, dispatch] = useReducer(planHistoryReducer, undefined, () => initHistory(loadPlan()));
  const plan = history.present;
  const [autoPickOpen, setAutoPickOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [semester, setSemester] = useState<Semester>('A');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>('courses');
  const [slot, setSlot] = useState<TimeSpan | null>(null);

  useEffect(() => savePlan(plan), [plan]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  // Выбранный курс мог быть удалён.
  const activeCourse = activeId && plan.courses.some((c) => c.courseId === activeId)
    ? courseMap.get(activeId) ?? null
    : null;

  const meetings = useMemo(() => collectMeetings(plan, courseMap, semester), [plan, semester]);
  const unscheduled = useMemo(() => collectUnscheduled(plan, courseMap, semester), [plan, semester]);
  const conflicts = useMemo(() => findConflicts(meetings), [meetings]);
  const misery = useMemo(() => computeMisery(meetings), [meetings]);
  const title = pickTitle(misery, meetings.length);
  const hours = academicHours(meetings);
  const credits = totalCredits(plan, courseMap);
  const slotOptions = useMemo(
    () => (slot ? optionsForSlot(catalog.courses, plan, semester, slot, meetings) : []),
    [slot, plan, semester, meetings],
  );

  /** Включить режим выбора групп курса; переключает семестр на семестр курса. */
  const startPicking = useCallback((course: Course) => {
    setSlot(null);
    setActiveId(course.courseId);
    if (course.term !== 'year') setSemester(course.term);
    setTab('week');
  }, []);

  const addCourse = useCallback(
    (course: Course) => {
      dispatch({ kind: 'add', course });
      startPicking(course);
    },
    [startPicking],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveId(null);
        setSlot(null);
        setAutoPickOpen(false);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTyping(e.target)) return;
      // e.code — чтобы работало и в ивритской/русской раскладке.
      const key = e.code === 'KeyZ' ? 'z' : e.code === 'KeyY' ? 'y' : '';
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ kind: 'undo' });
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        dispatch({ kind: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app" data-tab={tab}>
      <Header
        metadata={catalog.metadata}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => dispatch({ kind: 'undo' })}
        onRedo={() => dispatch({ kind: 'redo' })}
      />

      <main className="layout">
        <section className="pane pane-courses" aria-label="Courses">
          <CoursePanel
            catalog={catalog}
            plan={plan}
            activeId={activeCourse?.courseId ?? null}
            onAdd={addCourse}
            onRemove={(courseId) => dispatch({ kind: 'remove', courseId })}
            onPick={startPicking}
            onClear={() => dispatch({ kind: 'clear' })}
            onSetHidden={(courseId, hidden) => dispatch({ kind: 'setHidden', courseId, hidden })}
          />
        </section>

        <section className="pane pane-week" aria-label="Week">
          <StatsBar
            semester={semester}
            misery={misery}
            title={title}
            hours={hours}
            credits={credits}
            conflicts={conflicts}
          />
          <WeekGrid
            plan={plan}
            courses={courseMap}
            semester={semester}
            onSemester={setSemester}
            meetings={meetings}
            conflicts={conflicts}
            unscheduled={unscheduled}
            activeCourse={activeCourse}
            onActivate={(courseId) => {
              const course = courseMap.get(courseId);
              if (course) setActiveId(course.courseId);
            }}
            onToggleSection={(course, sectionNumber) =>
              dispatch({ kind: 'toggle', course, sectionNumber })
            }
            onDone={() => setActiveId(null)}
            slot={slot}
            onSlot={(day, start) => {
              setActiveId(null);
              setTab('week');
              setSlot(hourSlot(day, start));
            }}
            onAutoPick={() => {
              setActiveId(null);
              setSlot(null);
              setAutoPickOpen(true);
            }}
            onRemove={(courseId) => dispatch({ kind: 'remove', courseId })}
          />
        </section>
      </main>

      {slot && tab === 'week' && (
        <SlotSheet
          slot={slot}
          semester={semester}
          options={slotOptions}
          plan={plan}
          onAdd={(course, section) => dispatch({ kind: 'add', course, sectionNumber: section.sectionNumber })}
          onSwitch={(course, section) =>
            dispatch({ kind: 'select', course, sectionNumber: section.sectionNumber })
          }
          onClose={() => setSlot(null)}
        />
      )}

      {autoPickOpen && (
        <AutoPickDialog
          plan={plan}
          courses={courseMap}
          semester={semester}
          onSetRequired={(courseId, required) => dispatch({ kind: 'setRequired', courseId, required })}
          onApply={(result) => {
            dispatch({ kind: 'applyAuto', picks: result.picks, skipped: result.skipped });
            setAutoPickOpen(false);
            setTab('week');
          }}
          onClose={() => setAutoPickOpen(false)}
        />
      )}

      <footer className="footer">
        <p>
          <strong>Unofficial draft planner.</strong> Not affiliated with Bar-Ilan University. It does not
          register you for anything — registration happens only in Inbar. Always double-check there.
        </p>
        {catalog.metadata.isSample && (
          <p className="muted">
            Sample data, snapshot {catalog.metadata.updatedAt}. Groups marked <span className="demo-tag">DEMO</span>{' '}
            are invented for testing; credits are placeholders.
          </p>
        )}
      </footer>

      <nav className="tabbar" aria-label="Sections">
        <button type="button" className={tab === 'courses' ? 'on' : ''} onClick={() => setTab('courses')}>
          Courses <span className="count">{plan.courses.length}</span>
        </button>
        <button type="button" className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>
          Week {conflicts.length > 0 && <span className="count warn">{conflicts.length}</span>}
        </button>
      </nav>
    </div>
  );
}
