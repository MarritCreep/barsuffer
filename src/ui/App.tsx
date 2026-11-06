import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { catalog, courseMap } from '../data/catalog';
import type { Course, Semester } from '../data/types';
import { blockMeetings, isBlockId, nextBlockId } from '../logic/blocks';
import { findSprints } from '../logic/campus';
import { academicHours, totalCredits } from '../logic/load';
import { computeMisery, pickTitle } from '../logic/misery';
import { collectMeetings, collectUnscheduled, findConflicts, type TimeSpan } from '../logic/schedule';
import { hourSlot, optionsForSlot } from '../logic/slots';
import { formatMinutes } from '../logic/time';
import { dayOf, semesterOn } from '../logic/today';
import { initHistory, withHistory } from '../state/history';
import { loadSettings, saveSettings, type Settings } from '../state/settings';
import { loadPlan, loadTheme, savePlan, saveTheme, type Theme } from '../state/storage';
import { AutoPickDialog } from './AutoPickDialog';
import { CampusMap } from './CampusMap';
import { CoursePanel } from './CoursePanel';
import { Header } from './Header';
import { planReducer } from './planReducer';
import { SlotSheet } from './SlotSheet';
import { StatsBar } from './StatsBar';
import { TodayPanel } from './TodayPanel';
import { WeekGrid } from './WeekGrid';

type MobileTab = 'today' | 'courses' | 'week';

const planHistoryReducer = withHistory(planReducer);

/** Ctrl+Z внутри поля ввода должен отменять ввод текста, а не изменения расписания. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

/** Текущее время, обновляется раз в 30 секунд — для «Сегодня». */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function App() {
  const [history, dispatch] = useReducer(planHistoryReducer, undefined, () => initHistory(loadPlan()));
  const plan = history.present;
  const now = useNow();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [autoPickOpen, setAutoPickOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [semester, setSemester] = useState<Semester>(() => semesterOn(new Date()) ?? 'A');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>('courses');
  const [slot, setSlot] = useState<TimeSpan | null>(null);

  useEffect(() => savePlan(plan), [plan]);
  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  // Выбранный курс мог быть удалён.
  const activeCourse = activeId && plan.courses.some((c) => c.courseId === activeId)
    ? courseMap.get(activeId) ?? null
    : null;

  // Занятия — для индекса и часов; блокировки — только для сетки и накладок.
  const meetings = useMemo(() => collectMeetings(plan, courseMap, semester), [plan, semester]);
  const blocks = useMemo(() => blockMeetings(plan, semester), [plan, semester]);
  const busy = useMemo(() => [...meetings, ...blocks], [meetings, blocks]);
  const unscheduled = useMemo(() => collectUnscheduled(plan, courseMap, semester), [plan, semester]);
  const conflicts = useMemo(() => findConflicts(busy), [busy]);
  const sprints = useMemo(() => findSprints(meetings), [meetings]);
  const misery = useMemo(() => computeMisery(meetings), [meetings]);
  const title = pickTitle(misery, meetings.length);
  const hours = academicHours(meetings);
  const credits = totalCredits(plan, courseMap);
  const slotOptions = useMemo(
    () => (slot ? optionsForSlot(catalog.courses, plan, semester, slot, busy) : []),
    [slot, plan, semester, busy],
  );

  const classesFor = useCallback((s: Semester) => collectMeetings(plan, courseMap, s), [plan]);
  const busyFor = useCallback(
    (s: Semester) => [...collectMeetings(plan, courseMap, s), ...blockMeetings(plan, s)],
    [plan],
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

  const remove = (id: string) =>
    isBlockId(id) ? dispatch({ kind: 'removeBlock', id: id.slice('block:'.length) }) : dispatch({ kind: 'remove', courseId: id });

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

  const todaySemester = semesterOn(now);

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
        <div className="left-col">
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
        </div>

        <div className="right-col">
        {/* На десктопе «Сегодня» над индексом, чтобы всегда было видно; на телефоне — своя вкладка. */}
        <section className="pane pane-today" aria-label="Today">
          <TodayPanel now={now} meetingsFor={busyFor} />
        </section>
        <section className="pane pane-week" aria-label="Week">
          <StatsBar
            semester={semester}
            misery={misery}
            title={title}
            hours={hours}
            credits={credits}
            conflicts={conflicts}
            sprints={sprints}
            commuteMinutes={settings.commuteMinutes}
            onCommuteMinutes={(commuteMinutes) => setSettings((s) => ({ ...s, commuteMinutes }))}
          />
          <WeekGrid
            plan={plan}
            courses={courseMap}
            semester={semester}
            onSemester={setSemester}
            meetings={busy}
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
            onRemove={remove}
            sprints={sprints}
          />
        </section>
        </div>
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
          onAddBlock={(label, end, bothSemesters) => {
            dispatch({
              kind: 'addBlock',
              block: {
                id: nextBlockId(plan),
                label,
                day: slot.day,
                startTime: formatMinutes(slot.start),
                endTime: formatMinutes(end),
                semester: bothSemesters ? undefined : semester,
              },
            });
            setSlot(null);
          }}
        />
      )}

      {autoPickOpen && (
        <AutoPickDialog
          plan={plan}
          courses={courseMap}
          semester={semester}
          weights={settings.weights}
          onWeights={(weights) => setSettings((s) => ({ ...s, weights }))}
          blocked={blocks}
          commuteMinutes={settings.commuteMinutes}
          onSetRequired={(courseId, required) => dispatch({ kind: 'setRequired', courseId, required })}
          onApply={(result) => {
            dispatch({ kind: 'applyAuto', picks: result.picks, skipped: result.skipped });
            setAutoPickOpen(false);
            setTab('week');
          }}
          onClose={() => setAutoPickOpen(false)}
        />
      )}

      <CampusMap
        meetingsFor={classesFor}
        initialSemester={todaySemester ?? semester}
        initialDay={todaySemester ? dayOf(now) : null}
        hidden={slot !== null || autoPickOpen}
      />

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
        <button type="button" className={tab === 'today' ? 'on' : ''} onClick={() => setTab('today')}>
          Today
        </button>
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
