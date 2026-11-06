import { useEffect, useMemo, useRef, useState } from 'react';
import { DAYS, type Course, type Semester } from '../data/types';
import { useI18n } from '../i18n/I18n';
import { blockMeetings } from '../logic/blocks';
import { computeMisery } from '../logic/misery';
import { collectMeetings, type PlacedMeeting } from '../logic/schedule';
import type { Plan } from '../logic/selection';
import { decodeShare, payloadFromHash, shareUrl } from '../logic/share';
import { DAY_END, DAY_START, compareSchedules } from '../logic/together';
import { loadFriends, write, KEYS, type SavedFriend } from '../state/tools';
import { timeRange } from './format';

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  semester: Semester;
  /** Открыто по ссылке #friend=… — сразу сравнение. */
  initialPayload: string | null;
  onClose: () => void;
}

const NAME_KEY = 'barsuffer:myname:v1';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Достать полезную нагрузку из вставленной ссылки или из самой строки. */
function parsePasted(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const hashAt = trimmed.indexOf('#');
  if (hashAt >= 0) return payloadFromHash(trimmed.slice(hashAt));
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

/** Мини-неделя: две полосы (вы / друг) на каждый день, 08:00–20:00. */
function SideBySide({ mine, theirs, name }: { mine: PlacedMeeting[]; theirs: PlacedMeeting[]; name: string }) {
  const { t, day } = useI18n();
  const span = DAY_END - DAY_START;
  const bar = (list: PlacedMeeting[], d: number) =>
    list
      .filter((m) => m.day === d)
      .map((m) => {
        const s = Math.max(m.start, DAY_START);
        const e = Math.min(m.end, DAY_END);
        if (e <= s) return null;
        return (
          <span
            key={m.key}
            className={`sbs-block ${m.isBlock ? 'busy' : `c${m.color}`}`}
            style={{ insetInlineStart: `${((s - DAY_START) / span) * 100}%`, width: `${((e - s) / span) * 100}%` }}
            title={`${timeRange(m.start, m.end)} ${m.courseName}`}
          />
        );
      });
  return (
    <div className="sbs" aria-hidden="true">
      <div className="sbs-axis">
        {[8, 10, 12, 14, 16, 18, 20].map((h) => (
          <span key={h} style={{ insetInlineStart: `${((h * 60 - DAY_START) / span) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
      {DAYS.map((d) => (
        <div key={d} className="sbs-day">
          <span className="sbs-label">{day(d)}</span>
          <div className="sbs-lanes">
            <div className="sbs-lane" data-who={t('friend.you')}>
              {bar(mine, d)}
            </div>
            <div className="sbs-lane theirs" data-who={name}>
              {bar(theirs, d)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FriendDialog({ plan, courses, semester, initialPayload, onClose }: Props) {
  const { t, day, type, term } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const [tab, setTab] = useState<'share' | 'compare'>(initialPayload ? 'compare' : 'share');
  const [name, setName] = useState(loadName);
  const [copied, setCopied] = useState(false);
  const [payload, setPayload] = useState<string | null>(initialPayload);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState(false);
  const [friends, setFriends] = useState<SavedFriend[]>(loadFriends);
  const [sem, setSem] = useState<Semester>(semester);
  const [savedNote, setSavedNote] = useState('');

  const url = useMemo(() => shareUrl(window.location.href, plan, name), [plan, name]);
  const hasCourses = plan.courses.some((c) => !c.hidden);

  const rememberName = (v: string) => {
    setName(v);
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {
      /* не запомнится */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      (document.getElementById('friend-link') as HTMLInputElement | null)?.select();
    }
  };

  const shared = payload ? decodeShare(payload, courses) : null;
  const friendName = shared?.name || t('friend.someone');

  const mineAll = useMemo(() => [...collectMeetings(plan, courses, sem), ...blockMeetings(plan, sem)], [plan, courses, sem]);
  const theirsAll = useMemo(
    () => (shared ? [...collectMeetings(shared.plan, courses, sem), ...blockMeetings(shared.plan, sem)] : []),
    // shared пересоздаётся из payload
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payload, courses, sem],
  );
  const together = shared ? compareSchedules(mineAll, theirsAll) : null;
  const myScore = computeMisery(mineAll.filter((m) => !m.isBlock)).score;
  const theirScore = computeMisery(theirsAll.filter((m) => !m.isBlock)).score;
  const isSaved = payload !== null && friends.some((f) => f.payload === payload);

  const saveFriend = () => {
    if (!payload || isSaved) return;
    const next = [...friends, { id: `f${Date.now()}`, name: friendName, payload, savedAt: new Date().toISOString().slice(0, 10) }];
    setFriends(next);
    write(KEYS.friends, next);
    setSavedNote(t('friend.savedOk', { name: friendName }));
  };

  const forget = (id: string) => {
    const next = friends.filter((f) => f.id !== id);
    setFriends(next);
    write(KEYS.friends, next);
  };

  const openPasted = () => {
    const p = parsePasted(pasted);
    if (!p || !decodeShare(p, courses)) {
      setPasteError(true);
      return;
    }
    setPasteError(false);
    setPayload(p);
    setSavedNote('');
  };

  const dayList = (days: number[]) => days.map((d) => day(d as 1)).join(', ');
  const courseName = (id: string) => courses.get(id)?.name ?? id;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="modal tool-modal tool-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="friend-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slot-head">
          <div>
            <span className="pick-label">{t('friend.kicker')}</span>
            <strong id="friend-title" className="slot-time">
              {t('friend.title')}
            </strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="sem-tabs" role="tablist" aria-label={t('friend.title')}>
            <button type="button" role="tab" aria-selected={tab === 'share'} className={tab === 'share' ? 'on' : ''} onClick={() => setTab('share')}>
              {t('friend.tabShare')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'compare'} className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')}>
              {t('friend.tabCompare')}
            </button>
          </div>

          {tab === 'share' &&
            (hasCourses ? (
              <div className="friend-share">
                <label className="field">
                  <span className="field-label">{t('friend.name')}</span>
                  <input type="text" value={name} maxLength={30} placeholder={t('friend.namePh')} onChange={(e) => rememberName(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">{t('friend.link')}</span>
                  <input id="friend-link" type="text" readOnly value={url} dir="ltr" onFocus={(e) => e.target.select()} />
                </label>
                <div className="modal-actions">
                  {typeof navigator.share === 'function' && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => void navigator.share({ title: 'BarSuffer', text: t('friend.shareText'), url }).catch(() => {})}
                    >
                      {t('friend.share')}
                    </button>
                  )}
                  <button type="button" className="btn" onClick={() => void copy()}>
                    {copied ? t('friend.copied') : t('friend.copy')}
                  </button>
                </div>
                <p className="muted small">{t('friend.privacy')}</p>
              </div>
            ) : (
              <p className="hint-warn">{t('friend.empty')}</p>
            ))}

          {tab === 'compare' && (
            <div className="friend-compare">
              <form
                className="friend-paste"
                onSubmit={(e) => {
                  e.preventDefault();
                  openPasted();
                }}
              >
                <label className="field">
                  <span className="field-label">{t('friend.paste')}</span>
                  <input type="text" value={pasted} dir="ltr" placeholder={t('friend.pastePh')} onChange={(e) => setPasted(e.target.value)} />
                </label>
                <button type="submit" className="btn btn-small">
                  {t('friend.open')}
                </button>
              </form>
              {pasteError && <p className="hint-warn">{t('friend.bad')}</p>}

              {friends.length > 0 && (
                <div className="friend-saved">
                  <span className="field-label">{t('friend.saved')}</span>
                  <ul>
                    {friends.map((f) => (
                      <li key={f.id} className={f.payload === payload ? 'on' : ''}>
                        <button type="button" className="link-btn" onClick={() => setPayload(f.payload)}>
                          {f.name}
                        </button>
                        <button type="button" className="icon-btn" onClick={() => forget(f.id)} aria-label={t('friend.forget', { name: f.name })}>
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {shared && together && (
                <>
                  {payload === initialPayload && <p className="muted small">{t('friend.fromLink')}</p>}
                  <div className="sem-tabs" role="tablist" aria-label={t('cal.scope')}>
                    {(['A', 'B'] as const).map((s) => (
                      <button key={s} type="button" role="tab" aria-selected={sem === s} className={sem === s ? 'on' : ''} onClick={() => setSem(s)}>
                        {term(s, 'long')}
                      </button>
                    ))}
                  </div>

                  <h3 className="friend-vs">{t('friend.vs', { name: friendName })}</h3>
                  <div className="friend-scores">
                    <div>
                      <span className="field-label">{t('friend.you')}</span>
                      <strong className="friend-score">{myScore}</strong>
                    </div>
                    <div>
                      <span className="field-label">{friendName}</span>
                      <strong className="friend-score">{theirScore}</strong>
                    </div>
                    <span className="muted small">{t('friend.index')}</span>
                  </div>
                  <p>
                    {myScore === theirScore
                      ? t('friend.verdictTie')
                      : myScore > theirScore
                        ? t('friend.verdictThem', { name: friendName })
                        : t('friend.verdictYou', { name: friendName })}
                  </p>

                  {shared.dropped.length > 0 && <p className="hint-warn">{t('friend.dropped', { list: shared.dropped.join(', ') })}</p>}

                  <h4 className="friend-h">{t('friend.shared')}</h4>
                  {together.shared.length === 0 ? (
                    <p className="muted small">{t('friend.sharedNone')}</p>
                  ) : (
                    <ul className="friend-list">
                      {together.shared.map((s) => (
                        <li key={`${s.courseId}-${s.sectionNumber}-${s.day}-${s.start}`}>
                          <strong>{day(s.day)}</strong> <span dir="ltr">{timeRange(s.start, s.end)}</span> — {s.courseName}{' '}
                          <span className="muted small">
                            {type(s.type)} {s.sectionNumber}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {together.sameCourse.length > 0 && (
                    <p className="small">{t('friend.sameCourse', { list: together.sameCourse.map(courseName).join(', ') })}</p>
                  )}

                  <h4 className="friend-h">{t('friend.free')}</h4>
                  {together.bothOnCampus.length > 0 && <p className="small">{t('friend.campusDays', { days: dayList(together.bothOnCampus) })}</p>}
                  {together.bothOff.length > 0 && <p className="small">{t('friend.offDays', { days: dayList(together.bothOff) })}</p>}
                  {together.free.length === 0 ? (
                    <p className="muted small">{t('friend.freeNone')}</p>
                  ) : (
                    <ul className="friend-list">
                      {together.free
                        .filter((f) => !together.bothOff.includes(f.day))
                        .map((f) => (
                          <li key={`${f.day}-${f.start}`} className={f.onCampus ? 'on-campus' : ''}>
                            <strong>{day(f.day)}</strong> <span dir="ltr">{timeRange(f.start, f.end)}</span>
                            {f.onCampus && <span className="friend-badge">☕ {t('friend.onCampus')}</span>}
                          </li>
                        ))}
                    </ul>
                  )}

                  <h4 className="friend-h">{t('friend.week')}</h4>
                  <SideBySide mine={mineAll} theirs={theirsAll} name={friendName} />

                  <div className="modal-actions">
                    {savedNote && <span className="muted small">{savedNote}</span>}
                    {!isSaved && (
                      <button type="button" className="btn" onClick={saveFriend}>
                        {t('friend.save', { name: friendName })}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
