import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Course, Day } from '../data/types';
import type { Plan } from '../logic/selection';
import { formatDistance, funDistance, stepsFor } from '../logic/walking';
import { computeWrapped, type WrappedScope, type WrappedStats } from '../logic/wrapped';

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  commuteMinutes: number;
  gate: string;
  now: Date;
  initialScope: WrappedScope;
  onClose: () => void;
}

const SCOPES: { id: WrappedScope; label: string }[] = [
  { id: 'A', label: 'Sem A' },
  { id: 'B', label: 'Sem B' },
  { id: 'year', label: 'Year' },
];

const DAY_FULL: Record<Day, string> = {
  1: 'Sunday',
  2: 'Monday',
  3: 'Tuesday',
  4: 'Wednesday',
  5: 'Thursday',
  6: 'Friday',
};

const SITE = 'marritcreep.github.io/barsuffer';

function scopeName(scope: WrappedScope): string {
  return scope === 'year' ? 'the 2026–27 year' : `Semester ${scope}, 2026–27`;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

interface Slide {
  key: string;
  kicker: string;
  big?: string;
  unit?: string;
  lines: ReactNode[];
}

/** Тексты слайдов: будущее до периода, «уже/ещё» во время, прошедшее после. */
function buildSlides(s: WrappedStats, commuteMinutes: number): Slide[] {
  const will = (future: string, past: string) => (s.phase === 'after' ? past : future);
  const slides: Slide[] = [];

  slides.push({
    key: 'intro',
    kicker: 'BarSuffer Wrapped',
    big: s.scope === 'year' ? 'Your year' : `Sem ${s.scope}`,
    lines: [
      scopeName(s.scope),
      s.phase === 'before'
        ? 'It hasn’t started yet. Here’s what’s coming.'
        : s.phase === 'during'
          ? `${Math.round(s.fraction * 100)}% done. Here’s the whole picture.`
          : 'It’s over. Here’s how it went.',
      `${s.courses} ${s.courses === 1 ? 'course' : 'courses'} · ${s.weeks} weeks`,
    ],
  });

  slides.push({
    key: 'hours',
    kicker: will('You will spend', 'You spent'),
    big: fmt(s.classHours),
    unit: 'hours in class',
    lines: [
      `${fmt(s.sessions)} classes in total.`,
      s.classHours >= 24
        ? `That’s ${(s.classHours / 24).toFixed(1)} full days without sleep — or ${(s.classHours / 12).toFixed(0)} flights from Tel Aviv to New York.`
        : 'Barely a day. Suspiciously light.',
    ],
  });

  slides.push({
    key: 'alarms',
    kicker: will('Your alarm will ring', 'Your alarm rang'),
    big: fmt(s.earlyWakeups),
    unit: 'times for a class before 9:00',
    lines: [
      s.earlyWakeups === 0 ? 'Zero early mornings. Who are you?' : 'The sun sees you more than your friends do.',
      s.lateEvenings > 0
        ? `And ${fmt(s.lateEvenings)} evenings ending after 18:00.`
        : 'And not a single evening after 18:00.',
      ...(s.fridays > 0 ? [`Plus ${fmt(s.fridays)} Fridays on campus. Everyone else is at the beach.`] : []),
    ],
  });

  slides.push({
    key: 'walk',
    kicker: will('Between classes you will walk', 'Between classes you walked'),
    big: s.walkMeters >= 1000 ? (s.walkMeters / 1000).toFixed(1) : fmt(s.walkMeters),
    unit: s.walkMeters >= 1000 ? 'kilometres' : 'metres',
    lines: [
      `${fmt(stepsFor(s.walkMeters))} steps.`,
      s.walkMeters > 0 ? `That’s ${funDistance(s.walkMeters)}.` : 'All your classes are in the same building. Efficient.',
    ],
  });

  slides.push({
    key: 'gaps',
    kicker: will('You will wait', 'You waited'),
    big: fmt(s.gapHours),
    unit: 'hours in gaps between classes',
    lines: [
      s.gapHours === 0
        ? 'Zero gaps. Back-to-back legend.'
        : `Enough for ${fmt((s.gapHours * 60) / 20)} coffees. The library knows your name.`,
    ],
  });

  if (commuteMinutes > 0) {
    slides.push({
      key: 'commute',
      kicker: will('On the road you will spend', 'On the road you spent'),
      big: fmt(s.commuteHours),
      unit: 'hours',
      lines: [
        `${fmt(s.campusDays)} days on campus, ${commuteMinutes} min each way.`,
        s.commuteHours >= 10
          ? `That’s ${fmt(s.commuteHours / 10)} audiobooks. Or one very long podcast.`
          : 'Short and sweet.',
      ],
    });
  }

  if (s.hellDay) {
    slides.push({
      key: 'hell',
      kicker: will('Your hell day', 'Your hell day was'),
      big: DAY_FULL[s.hellDay.day],
      lines: [
        `${s.hellDay.score} suffering points on its own${s.scope === 'year' ? ` (Semester ${s.hellDay.semester})` : ''}.`,
        'Plan something nice for that evening.',
      ],
    });
  }

  slides.push({ key: 'final', kicker: 'Your suffering index', lines: [] });
  return slides;
}

/** Картинка для сторис 1080×1920, рисуется в браузере. */
async function renderStory(s: WrappedStats): Promise<Blob | null> {
  try {
    await Promise.all([
      document.fonts.load('700 120px "Caveat Variable"'),
      document.fonts.load('800 80px "Rubik Variable"'),
    ]);
  } catch {
    /* шрифты не загрузились — нарисуем системными */
  }
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2a1b6b');
  bg.addColorStop(0.55, '#141026');
  bg.addColorStop(1, '#0f1115');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(139,124,255,0.25)';
  ctx.beginPath();
  ctx.arc(W - 120, 260, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,159,90,0.18)';
  ctx.beginPath();
  ctx.arc(140, H - 420, 300, 0, Math.PI * 2);
  ctx.fill();

  const hand = (size: number) => `700 ${size}px "Caveat Variable", cursive`;
  const ui = (weight: number, size: number) => `${weight} ${size}px "Rubik Variable", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';

  ctx.font = hand(110);
  ctx.fillText('BarSuffer Wrapped', W / 2, 200);
  ctx.font = ui(500, 44);
  ctx.fillStyle = '#c9c3ff';
  ctx.fillText(scopeName(s.scope), W / 2, 280);

  ctx.font = ui(600, 40);
  ctx.fillStyle = '#9097a6';
  ctx.fillText('SUFFERING INDEX', W / 2, 430);
  ctx.font = hand(400);
  ctx.fillStyle = s.score >= 70 ? '#ff5c5c' : s.score >= 40 ? '#f2b84b' : '#7fd17f';
  ctx.fillText(String(s.score), W / 2, 760);
  ctx.font = ui(600, 52);
  ctx.fillStyle = '#9097a6';
  ctx.fillText('/ 100', W / 2, 840);

  ctx.font = hand(120);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(s.title.title, W / 2, 1000);
  ctx.font = ui(400, 38);
  ctx.fillStyle = '#c4c8d2';
  ctx.fillText(s.title.blurb, W / 2, 1070, W - 120);

  const cells: [string, string][] = [
    [fmt(s.classHours), 'hours in class'],
    [fmt(s.earlyWakeups), 'alarms before 9'],
    [formatDistance(s.walkMeters), 'walked on campus'],
    [fmt(s.gapHours), 'hours in gaps'],
  ];
  cells.forEach(([value, label], i) => {
    const x = i % 2 === 0 ? W * 0.27 : W * 0.73;
    const y = 1260 + Math.floor(i / 2) * 230;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.roundRect(x - 230, y - 120, 460, 190, 28);
    ctx.fill();
    ctx.font = ui(800, 84);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, x, y);
    ctx.font = ui(500, 34);
    ctx.fillStyle = '#9097a6';
    ctx.fillText(label, x, y + 52);
  });

  if (s.hellDay) {
    ctx.font = ui(600, 42);
    ctx.fillStyle = '#ffb08a';
    ctx.fillText(`🔥 Hell day: ${DAY_FULL[s.hellDay.day]}`, W / 2, 1730);
  }

  ctx.font = ui(600, 34);
  ctx.fillStyle = '#c9c3ff';
  ctx.fillText(SITE, W / 2, H - 110, W - 80);
  ctx.font = ui(500, 28);
  ctx.fillStyle = '#7c8394';
  ctx.fillText('Unofficial · not affiliated with Bar-Ilan University', W / 2, H - 62, W - 80);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function Wrapped({ plan, courses, commuteMinutes, gate, now, initialScope, onClose }: Props) {
  const [scope, setScope] = useState<WrappedScope>(initialScope);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(
    () => computeWrapped(plan, courses, scope, { commuteMinutes, gate: gate || undefined }, now),
    [plan, courses, scope, commuteMinutes, gate, now],
  );
  const slides = useMemo(() => buildSlides(stats, commuteMinutes), [stats, commuteMinutes]);
  const slide = slides[Math.min(index, slides.length - 1)]!;
  const last = index >= slides.length - 1;

  useEffect(() => rootRef.current?.focus(), []);
  useEffect(() => setIndex(0), [scope]);

  const next = () => setIndex((i) => Math.min(i + 1, slides.length - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const save = async (share: boolean) => {
    setBusy(true);
    try {
      const blob = await renderStory(stats);
      if (!blob) return;
      const file = new File([blob], `barsuffer-wrapped-${scope}.png`, { type: 'image/png' });
      if (share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My BarSuffer Wrapped' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* пользователь отменил «поделиться» */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="wrapped"
      role="dialog"
      aria-modal="true"
      aria-label="BarSuffer Wrapped"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
          next();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          prev();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={`story story-${slide.key}`}>
        <div className="story-top">
          <div className="story-bars" aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.key} className={i < index ? 'done' : i === index ? 'on' : ''} />
            ))}
          </div>
          <div className="story-controls">
            <div className="sem-tabs" role="tablist" aria-label="Wrapped period">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={scope === s.id}
                  className={scope === s.id ? 'on' : ''}
                  onClick={() => setScope(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close Wrapped">
              ×
            </button>
          </div>
        </div>

        {stats.empty ? (
          <div className="story-body">
            <p className="story-kicker">BarSuffer Wrapped</p>
            <p className="story-big">Nothing yet</p>
            <p className="story-line">Add some courses to {scopeName(scope)} first, then come back.</p>
          </div>
        ) : slide.key === 'final' ? (
          <div className="story-body">
            <p className="story-kicker">{slide.kicker}</p>
            <p className={`story-score level-${stats.score >= 70 ? 'high' : stats.score >= 40 ? 'mid' : 'low'}`}>
              {stats.score}
              <small>/100</small>
            </p>
            <p className="story-title">{stats.title.title}</p>
            <p className="story-line">{stats.title.blurb}</p>
            <div className="story-grid">
              <span><b>{fmt(stats.classHours)}</b>hours in class</span>
              <span><b>{fmt(stats.earlyWakeups)}</b>alarms before 9</span>
              <span><b>{formatDistance(stats.walkMeters)}</b>walked</span>
              <span><b>{fmt(stats.gapHours)}</b>hours in gaps</span>
            </div>
            <div className="story-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>
                Share story
              </button>
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void save(false)}>
                Save image
              </button>
            </div>
          </div>
        ) : (
          <div className="story-body">
            <p className="story-kicker">{slide.kicker}</p>
            {slide.big && <p className="story-big">{slide.big}</p>}
            {slide.unit && <p className="story-unit">{slide.unit}</p>}
            {slide.lines.map((line, i) => (
              <p key={i} className="story-line">
                {line}
              </p>
            ))}
          </div>
        )}

        {!stats.empty && (
          <>
            <button
              type="button"
              className="story-tap prev"
              onClick={prev}
              disabled={index === 0}
              aria-label="Previous slide"
            />
            <button
              type="button"
              className="story-tap next"
              onClick={next}
              disabled={last}
              aria-label="Next slide"
            />
          </>
        )}
        <p className="story-foot">
          Estimates from your planned schedule · unofficial · {index + 1}/{slides.length}
        </p>
      </div>
    </div>
  );
}
