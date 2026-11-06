import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { catalog, courseMap } from '../data/catalog';
import type { Course, Semester } from '../data/types';
import { blockMeetings, isBlockId, nextBlockId } from '../logic/blocks';
import { findSprints } from '../logic/campus';
import { coffeeGaps } from '../logic/coffee';
import { academicHours, totalCredits } from '../logic/load';
import { computeMisery, dayMisery, hellDay, pickTitle } from '../logic/misery';
import { weekWalkMeters } from '../logic/walking';
import { collectMeetings, collectUnscheduled, findConflicts, type TimeSpan } from '../logic/schedule';
import { hourSlot, optionsForSlot } from '../logic/slots';
import { formatMinutes } from '../logic/time';
import { dayOf, semesterOn } from '../logic/today';
import { backupFileName, makeBackup, readBackup } from '../state/backup';
import { initHistory, withHistory } from '../state/history';
import { loadSettings, saveSettings, type Settings } from '../state/settings';
import { applyAppearance, loadAppearance, saveAppearance, type Appearance } from '../state/appearance';
import { loadPlan, savePlan } from '../state/storage';
import { AutoPickDialog } from './AutoPickDialog';
import { CampusMap } from './CampusMap';
import { CoursePanel } from './CoursePanel';
import { Header } from './Header';
import { BackupDialog } from './BackupDialog';
import { ImportDialog } from './ImportDialog';
import type { Plan } from '../logic/selection';
import { planReducer } from './planReducer';
import { SlotSheet } from './SlotSheet';
import { StatsBar } from './StatsBar';
import { TodayPanel } from './TodayPanel';
import { useForecast } from './useForecast';
import { WeekGrid } from './WeekGrid';
import { WeekInsights } from './WeekInsights';
import { Wrapped } from './Wrapped';

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
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'error'; undo?: () => void } | null>(null);
  const [pendingBackup, setPendingBackup] = useState<
    { fileName: string; plan: Plan; settings: Settings; dropped: string[] } | null
  >(null);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);
  const forecast = useForecast();
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance);
  const [semester, setSemester] = useState<Semester>(() => semesterOn(new Date()) ?? 'A');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>('courses');
  const [slot, setSlot] = useState<TimeSpan | null>(null);

  useEffect(() => savePlan(plan), [plan]);
  useEffect(() => saveSettings(settings), [settings]);

  // Оформление применяется сразу (в том числе предпросмотр), сохраняется только по «Apply».
  useEffect(() => applyAppearance(appearance), [appearance]);

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
  const dayScores = useMemo(() => dayMisery(meetings), [meetings]);
  const hell = useMemo(() => hellDay(meetings), [meetings]);
  const weekMeters = useMemo(() => weekWalkMeters(meetings, settings.gate || undefined), [meetings, settings.gate]);
  const gaps = useMemo(() => coffeeGaps(meetings), [meetings]);
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
        setWrappedOpen(false);
        setImportOpen(false);
        setPendingBackup(null);
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
      {appearance.fog && (
        <div className="fog" aria-hidden="true">
          <span className="fog-blob b1" />
          <span className="fog-blob b2" />
          <span className="fog-blob b3" />
          <span className="fog-blob b4" />
        </div>
      )}
      <Header
        metadata={catalog.metadata}
        appearance={appearance}
        onPreviewAppearance={setAppearance}
        onApplyAppearance={(a) => {
          setAppearance(a);
          saveAppearance(a);
        }}
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
              onImportInbar={() => setImportOpen(true)}
              onSaveFile={() => {
                const blob = new Blob([makeBackup(plan, settings)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = backupFileName();
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setNotice({ text: 'Saved. Open this file later to get your schedule back.', kind: 'ok' });
              }}
              onOpenFile={(file) => {
                void file.text().then((text) => {
                  const result = readBackup(text, courseMap);
                  if (!result.ok) {
                    setNotice({ text: result.error, kind: 'error' });
                    return;
                  }
                  // Сначала показать содержимое; применяется только по «Apply changes».
                  setPendingBackup({ fileName: file.name, plan: result.plan, settings: result.settings, dropped: result.dropped });
                });
              }}
            />
          </section>
        </div>

        <div className="right-col">
        {/* На десктопе «Сегодня» над индексом, чтобы всегда было видно; на телефоне — своя вкладка. */}
        <section className="pane pane-today" aria-label="Today">
          <TodayPanel now={now} meetingsFor={busyFor} forecast={forecast} gate={settings.gate} />
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
            dayScores={dayScores}
            hellDay={hell?.day ?? null}
            onWrapped={() => {
              setActiveId(null);
              setSlot(null);
              setWrappedOpen(true);
            }}
          />
          <WeekInsights hell={hell} weekMeters={weekMeters} gaps={gaps} />
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
        hidden={slot !== null || autoPickOpen || wrappedOpen || importOpen}
        gate={settings.gate}
        onGate={(gate) => setSettings((s) => ({ ...s, gate }))}
      />

      {importOpen && (
        <ImportDialog
          plan={plan}
          courses={courseMap}
          onApply={(next) => {
            const previous = plan;
            dispatch({ kind: 'replacePlan', plan: next });
            setImportOpen(false);
            setNotice({
              text: 'Imported from Inbar.',
              kind: 'ok',
              undo: () => dispatch({ kind: 'replacePlan', plan: previous }),
            });
          }}
          onClose={() => setImportOpen(false)}
        />
      )}

      {pendingBackup && (
        <BackupDialog
          fileName={pendingBackup.fileName}
          incoming={pendingBackup.plan}
          current={plan}
          dropped={pendingBackup.dropped}
          courses={courseMap}
          onCancel={() => setPendingBackup(null)}
          onApply={() => {
            const previousSettings = settings;
            const previousPlan = plan;
            dispatch({ kind: 'replacePlan', plan: pendingBackup.plan });
            setSettings(pendingBackup.settings);
            setPendingBackup(null);
            setNotice({
              text: `Loaded ${pendingBackup.plan.courses.length} ${pendingBackup.plan.courses.length === 1 ? 'course' : 'courses'} from the file.`,
              kind: 'ok',
              undo: () => {
                dispatch({ kind: 'replacePlan', plan: previousPlan });
                setSettings(previousSettings);
              },
            });
          }}
        />
      )}

      {notice && (
        <div className={`notice ${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <span className="notice-actions">
            {notice.undo && (
              <button
                type="button"
                className="btn btn-quiet btn-small"
                onClick={() => {
                  notice.undo?.();
                  setNotice({ text: 'Undone — your previous schedule is back.', kind: 'ok' });
                }}
              >
                Undo
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </span>
        </div>
      )}

      {wrappedOpen && (
        <Wrapped
          plan={plan}
          courses={courseMap}
          commuteMinutes={settings.commuteMinutes}
          gate={settings.gate}
          now={now}
          initialScope={semester}
          onClose={() => setWrappedOpen(false)}
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
