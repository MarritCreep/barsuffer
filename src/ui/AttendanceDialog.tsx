import { useEffect, useMemo, useRef, useState } from 'react';
import { ACADEMIC_CALENDAR } from '../data/calendar';
import type { Course, Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import {
  DEFAULT_REQUIRED,
  OLAMOT_RULE,
  inMiluim,
  isPast,
  miluimImpact,
  sectionAttendance,
  toggleAbsent,
  type AttendanceLog,
  type AttendanceRule,
  type MiluimImpact,
  type SectionAttendance,
} from '../logic/attendance';
import { collectMeetings } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import { occurrences, type Occurrence } from '../logic/sessions';
import { formatMinutes } from '../logic/time';
import { localDate, parseDate } from '../logic/today';
import { KEYS, loadAttendance, write } from '../state/tools';
import './AttendanceDialog.css';

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  semester: Semester;
  now: Date;
  onClose: () => void;
}

type RuleChoice = 'pct80' | 'pct70' | 'pct90' | 'olamot' | 'abs' | 'custom' | 'none';

const OLAMOT_MAX = OLAMOT_RULE.kind === 'abs' ? OLAMOT_RULE.value : 2;

function choiceOf(rule: AttendanceRule): RuleChoice {
  if (rule.kind === 'none') return 'none';
  if (rule.kind === 'abs') return rule.value === OLAMOT_MAX ? 'olamot' : 'abs';
  if (rule.value === 80) return 'pct80';
  if (rule.value === 70) return 'pct70';
  if (rule.value === 90) return 'pct90';
  return 'custom';
}

const groupId = (courseId: string, sectionNumber: string) => `${courseId}|${sectionNumber}`;

function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** Даты по умолчанию для нового милуим: неделя с сегодняшнего дня (или с начала семестра). */
function defaultRange(semester: Semester, today: string): { from: string; to: string } {
  const dates = ACADEMIC_CALENDAR.find((s) => s.semester === semester);
  if (!dates) return { from: today, to: addDays(today, 6) };
  const from = today >= dates.start && today <= dates.end ? today : dates.start;
  const week = addDays(from, 6);
  return { from, to: week > dates.end ? dates.end : week };
}

export function AttendanceDialog({ plan, courses, semester: initialSemester, now, onClose }: Props) {
  const { t, term } = useI18n();
  const [log, setLog] = useState<AttendanceLog>(() => loadAttendance());
  const [semester, setSemester] = useState<Semester>(initialSemester);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const save = (next: AttendanceLog) => {
    setLog(next);
    write(KEYS.attendance, next);
  };

  const today = localDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const meetings = useMemo(
    () => collectMeetings(plan, courses, semester).filter((m) => !m.isBlock),
    [plan, courses, semester],
  );
  const all = useMemo(() => occurrences(meetings, semester), [meetings, semester]);
  const held = useMemo(() => all.filter((o) => !o.cancelledBy), [all]);
  const stats = useMemo(() => sectionAttendance(held, log, today, nowMinutes), [held, log, today, nowMinutes]);
  const impacts = useMemo(() => miluimImpact(held, log.miluim), [held, log.miluim]);

  const byGroup = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of all) {
      const id = groupId(o.meeting.courseId, o.meeting.sectionNumber);
      map.set(id, [...(map.get(id) ?? []), o]);
    }
    return map;
  }, [all]);

  // Карточки по курсам: правило задаётся на курс, группы курса идут под ним.
  const byCourse = useMemo(() => {
    const map = new Map<string, SectionAttendance[]>();
    for (const s of stats) map.set(s.courseId, [...(map.get(s.courseId) ?? []), s]);
    return [...map.values()];
  }, [stats]);

  const colorOf = (courseId: string) => meetings.find((m) => m.courseId === courseId)?.color ?? 0;

  const setRule = (courseId: string, rule: AttendanceRule | null) => {
    const rules = { ...log.rules };
    if (rule) rules[courseId] = rule;
    else delete rules[courseId];
    save({ ...log, rules });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal att-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attend-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slot-head">
          <div>
            <span className="pick-label">{t('attend.label', { sem: term(semester) })}</span>
            <strong id="attend-title" className="slot-time">
              {t('attend.title')}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="sem-tabs att-tabs" role="tablist" aria-label={t('attend.semesterTabs')}>
            {(['A', 'B'] as Semester[]).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={semester === s}
                className={semester === s ? 'on' : ''}
                onClick={() => setSemester(s)}
              >
                {term(s)}
              </button>
            ))}
          </div>

          <p className="muted small">{t('attend.intro')}</p>

          <MiluimSection
            key={semester}
            log={log}
            impacts={impacts}
            semester={semester}
            today={today}
            onChange={save}
          />

          <section className="att-section" aria-labelledby="attend-groups">
            <h3 id="attend-groups" className="att-h">
              {t('attend.groupsTitle')}
            </h3>
            {byCourse.length === 0 ? (
              <p className="empty">{t('attend.empty', { sem: term(semester, 'long') })}</p>
            ) : (
              <>
                <p className="muted small">{t('attend.syllabusHint')}</p>
                {byCourse.map((groups) => {
                  const first = groups[0]!;
                  return (
                    <div key={first.courseId} className={`att-course c${colorOf(first.courseId)}`}>
                      <div className="att-course-head">
                        <strong className="att-course-name">
                          <bdi>{first.courseName}</bdi>
                        </strong>
                        <RuleSelect
                          courseId={first.courseId}
                          courseName={first.courseName}
                          rule={first.rule}
                          onRule={(rule) => setRule(first.courseId, rule)}
                        />
                      </div>
                      {groups.map((s) => (
                        <GroupCard
                          key={s.sectionNumber}
                          stats={s}
                          list={byGroup.get(groupId(s.courseId, s.sectionNumber)) ?? []}
                          log={log}
                          today={today}
                          nowMinutes={nowMinutes}
                          onToggle={(key) => save(toggleAbsent(log, key))}
                        />
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MiluimSection({
  log,
  impacts,
  semester,
  today,
  onChange,
}: {
  log: AttendanceLog;
  impacts: MiluimImpact[];
  semester: Semester;
  today: string;
  onChange: (log: AttendanceLog) => void;
}) {
  const { t, term, date } = useI18n();
  const [range, setRange] = useState(() => defaultRange(semester, today));
  const bad = !range.from || !range.to || range.to < range.from;
  const fmt = (iso: string) => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });

  const add = () => {
    if (bad) return;
    const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const miluim = [...log.miluim, { id, from: range.from, to: range.to }].sort((a, b) => a.from.localeCompare(b.from));
    onChange({ ...log, miluim });
  };

  const remove = (id: string) => onChange({ ...log, miluim: log.miluim.filter((p) => p.id !== id) });

  return (
    <section className="att-section att-miluim" aria-labelledby="attend-miluim">
      <h3 id="attend-miluim" className="att-h">
        {t('attend.miluimTitle')}
      </h3>
      <p className="muted small">{t('attend.miluimIntro')}</p>

      <div className="att-form">
        <label className="att-field">
          <span className="small muted">{t('attend.from')}</span>
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="att-field">
          <span className="small muted">{t('attend.to')}</span>
          <input
            type="date"
            value={range.to}
            min={range.from || undefined}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </label>
        <button type="button" className="btn btn-small" disabled={bad} onClick={add}>
          {t('attend.addPeriod')}
        </button>
      </div>
      {bad && range.from && range.to && <p className="hint-warn">{t('attend.badRange')}</p>}

      {impacts.length === 0 ? (
        <p className="muted small">{t('attend.noPeriods')}</p>
      ) : (
        <ul className="att-periods">
          {impacts.map(({ period, sessions, classDays, byCourse }) => {
            const rangeText = t('attend.period', { from: fmt(period.from), to: fmt(period.to) });
            return (
              <li key={period.id} className="att-period">
                <div className="att-period-head">
                  <strong>{rangeText}</strong>
                  <button
                    type="button"
                    className="btn btn-quiet btn-small"
                    onClick={() => remove(period.id)}
                    aria-label={t('attend.removePeriod', { range: rangeText })}
                  >
                    {t('common.remove')}
                  </button>
                </div>
                {sessions === 0 ? (
                  <p className="muted small">{t('attend.miluimNone', { sem: term(semester, 'long') })}</p>
                ) : (
                  <>
                    <p className="small att-impact">
                      {t('attend.miluimImpact', {
                        classes: t('common.classes', { n: sessions }),
                        days: t('common.days', { n: classDays }),
                      })}
                    </p>
                    <ul className="att-impact-list small">
                      {[...byCourse.entries()].map(([courseId, { courseName, count }]) => (
                        <li key={courseId}>
                          <bdi>{courseName}</bdi> — {t('common.classes', { n: count })}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="small att-rights">{t('attend.miluimRights')}</p>
    </section>
  );
}

function RuleSelect({
  courseId,
  courseName,
  rule,
  onRule,
}: {
  courseId: string;
  courseName: string;
  rule: AttendanceRule;
  onRule: (rule: AttendanceRule | null) => void;
}) {
  const { t } = useI18n();
  // «Свой %» остаётся выбранным, даже если ввели 80 — пока студент сам не выберет другое.
  const [customMode, setCustomMode] = useState(false);
  const derived = choiceOf(rule);
  const choice: RuleChoice = customMode && rule.kind === 'pct' ? 'custom' : derived;
  const pct = rule.kind === 'pct' ? rule.value : DEFAULT_REQUIRED;

  const pick = (c: RuleChoice) => {
    setCustomMode(c === 'custom');
    switch (c) {
      case 'pct80':
        return onRule(null);
      case 'pct70':
        return onRule({ kind: 'pct', value: 70 });
      case 'pct90':
        return onRule({ kind: 'pct', value: 90 });
      case 'olamot':
        return onRule(OLAMOT_RULE);
      case 'none':
        return onRule({ kind: 'none' });
      case 'custom':
        return onRule({ kind: 'pct', value: rule.kind === 'pct' && rule.value !== DEFAULT_REQUIRED ? rule.value : 75 });
      case 'abs':
        return undefined;
    }
  };

  return (
    <div className="att-rule">
      <label className="att-field">
        <span className="small muted">{t('attend.ruleLabel')}</span>
        <select
          value={choice}
          onChange={(e) => pick(e.target.value as RuleChoice)}
          aria-label={t('attend.ruleFor', { name: courseName })}
        >
          <option value="pct80">{t('attend.rule.pct80')}</option>
          <option value="pct70">{t('attend.rule.pct70')}</option>
          <option value="pct90">{t('attend.rule.pct90')}</option>
          <option value="olamot">{t('attend.rule.olamot')}</option>
          {derived === 'abs' && rule.kind === 'abs' && (
            <option value="abs">{t('attend.rule.abs', { n: rule.value })}</option>
          )}
          <option value="custom">{t('attend.rule.custom')}</option>
          <option value="none">{t('attend.rule.none')}</option>
        </select>
      </label>
      {choice === 'custom' && (
        <CustomPct
          key={courseId}
          value={pct}
          label={t('attend.customFor', { name: courseName })}
          onValue={(value) => onRule({ kind: 'pct', value })}
        />
      )}
    </div>
  );
}

function CustomPct({ value, label, onValue }: { value: number; label: string; onValue: (v: number) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(String(value));
  return (
    <label className="att-field att-pct">
      <span className="small muted">{t('attend.customPct')}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        step={1}
        value={draft}
        aria-label={label}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isInteger(v) && v >= 1 && v <= 100) onValue(v);
        }}
      />
    </label>
  );
}

function GroupCard({
  stats: s,
  list,
  log,
  today,
  nowMinutes,
  onToggle,
}: {
  stats: SectionAttendance;
  list: Occurrence[];
  log: AttendanceLog;
  today: string;
  nowMinutes: number;
  onToggle: (key: string) => void;
}) {
  const { t, type, day, date } = useI18n();
  const absent = new Set(log.absent);
  const held = list.filter((o) => !o.cancelledBy);
  const isMissed = (o: Occurrence) => absent.has(o.key) || inMiluim(o.date, log.miluim) !== undefined;
  const attended = held.filter((o) => isPast(o, today, nowMinutes) && !isMissed(o)).length;
  const ahead = held.filter((o) => !isPast(o, today, nowMinutes) && !isMissed(o)).length;
  const planned = held.filter((o) => !isPast(o, today, nowMinutes) && absent.has(o.key)).length;
  const pctOf = (n: number) => (s.total === 0 ? 0 : (n / s.total) * 100);

  const tail =
    s.status === 'free'
      ? t('attend.free')
      : s.left < 0
        ? t('attend.over', { n: -s.left })
        : s.left === 0
          ? t('attend.noMore')
          : t('attend.canMiss', { n: s.left });

  const notes = [
    s.missedMiluim > 0 && t('attend.inclMiluim', { n: s.missedMiluim }),
    planned > 0 && t('attend.planned', { n: planned }),
    s.rule.kind !== 'none' && t('attend.allowed', { n: s.allowed }),
  ].filter(Boolean);

  return (
    <div className={`att-group att-${s.status}`}>
      <div className="att-group-head">
        <span className="att-group-name">{t('attend.group', { type: type(s.type), num: s.sectionNumber })}</span>
        <span className="att-badge">{t(`attend.status.${s.status}` as MessageKey)}</span>
      </div>

      <div
        className="att-bar"
        role="img"
        aria-label={t('attend.barAria', { attended, missed: s.missed, ahead })}
      >
        <span className="att-bar-attended" style={{ inlineSize: `${pctOf(attended)}%` }} />
        <span className="att-bar-missed" style={{ inlineSize: `${pctOf(s.missed)}%` }} />
        <span className="att-bar-ahead" style={{ inlineSize: `${pctOf(ahead)}%` }} />
      </div>
      <div className="att-legend small muted" aria-hidden="true">
        <span>
          <i className="att-dot att-bar-attended" /> {t('attend.bar.attended')} {attended}
        </span>
        <span>
          <i className="att-dot att-bar-missed" /> {t('attend.bar.missed')} {s.missed}
        </span>
        <span>
          <i className="att-dot att-bar-ahead" /> {t('attend.bar.ahead')} {ahead}
        </span>
      </div>

      <p className="att-status">
        {t('attend.missedOf', { missed: s.missed, total: s.total })} · {tail}
      </p>
      {notes.length > 0 && <p className="small muted">{notes.join(' · ')}</p>}

      <details className="att-dates">
        <summary>{t('attend.showDates', { count: list.length })}</summary>
        <ul>
          {list.map((o) => {
            const past = isPast(o, today, nowMinutes);
            const miluim = inMiluim(o.date, log.miluim) !== undefined;
            const marked = absent.has(o.key);
            const cls = [
              'att-date',
              past ? 'past' : 'future',
              o.cancelledBy ? 'cancelled' : '',
              marked || (miluim && !o.cancelledBy) ? 'missed' : '',
              o.date === today ? 'today' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li key={o.key} className={cls}>
                <span className="att-when">
                  <span>
                    {day(o.meeting.day)} {date(o.date, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="muted small" dir="ltr">
                    {formatMinutes(o.meeting.start)}–{formatMinutes(o.meeting.end)}
                  </span>
                  {o.date === today && <span className="chip">{t('attend.today')}</span>}
                </span>
                {o.cancelledBy ? (
                  <span className="att-note small">
                    {t(`holiday.${o.cancelledBy}` as MessageKey)} · {t('attend.noClass')}
                  </span>
                ) : (
                  <span className="att-date-end">
                    {o.shortenedBy && (
                      <span className="att-note small">
                        {t('attend.shortened', { holiday: t(`holiday.${o.shortenedBy}` as MessageKey) })}
                      </span>
                    )}
                    {miluim && <span className="chip att-chip-miluim">{t('attend.miluimTag')}</span>}
                    <label className="att-check">
                      <input
                        type="checkbox"
                        checked={marked || miluim}
                        disabled={miluim && !marked}
                        onChange={() => onToggle(o.key)}
                      />
                      {t('attend.missed')}
                    </label>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
