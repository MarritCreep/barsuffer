import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Course } from '../data/types';
import { useI18n, type Translator } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import type { Plan } from '../logic/selection';
import { stepsFor } from '../logic/walking';
import { computeWrapped, type WrappedScope, type WrappedStats } from '../logic/wrapped';
import { distance, fixed, funText, titleText } from './weekText';

interface Props {
  plan: Plan;
  courses: ReadonlyMap<string, Course>;
  commuteMinutes: number;
  gate: string;
  now: Date;
  initialScope: WrappedScope;
  onClose: () => void;
}

const SCOPES: WrappedScope[] = ['A', 'B', 'year'];

const SITE = 'marritcreep.github.io/barsuffer';

function scopeName(tr: Translator, scope: WrappedScope): string {
  return tr.t(`wrapped.scope.${scope}` as MessageKey);
}

function scopeLabel(tr: Translator, scope: WrappedScope): string {
  return scope === 'year' ? tr.t('wrapped.year') : tr.term(scope);
}

/** Целое число в формате языка (как прежнее toLocaleString('en-US')). */
const fmt = (tr: Translator, n: number) => tr.num(Math.round(n));

interface Slide {
  key: string;
  kicker: string;
  big?: string;
  unit?: string;
  lines: ReactNode[];
}

/** Тексты слайдов: будущее до периода, «уже/ещё» во время, прошедшее после. */
function buildSlides(tr: Translator, s: WrappedStats, commuteMinutes: number): Slide[] {
  const { t } = tr;
  /** Ключ `<base>.future` до/во время периода, `<base>.past` — после. */
  const will = (base: string) => t(`${base}.${s.phase === 'after' ? 'past' : 'future'}` as MessageKey);
  const count = (key: MessageKey, n: number, extra?: Record<string, string | number>) =>
    t(key, { n: Math.round(n), count: fmt(tr, n), ...extra });
  const slides: Slide[] = [];

  slides.push({
    key: 'intro',
    kicker: 'BarSuffer Wrapped',
    big: s.scope === 'year' ? t('wrapped.yourYear') : tr.term(s.scope),
    lines: [
      scopeName(tr, s.scope),
      s.phase === 'before'
        ? t('wrapped.before')
        : s.phase === 'during'
          ? t('wrapped.during', { p: Math.round(s.fraction * 100) })
          : t('wrapped.after'),
      `${t('common.courses', { n: s.courses })} · ${t('wrapped.weeks', { n: s.weeks })}`,
    ],
  });

  slides.push({
    key: 'hours',
    kicker: will('wrapped.hours'),
    big: fmt(tr, s.classHours),
    unit: t('wrapped.hours.unit', { n: s.classHours }),
    lines: [
      count('wrapped.sessions', s.sessions),
      s.classHours >= 24
        ? t('wrapped.sleepless', {
            n: Math.round(s.classHours / 12),
            days: fixed(tr, s.classHours / 24, 1),
            flights: fixed(tr, s.classHours / 12, 0),
          })
        : t('wrapped.light'),
    ],
  });

  slides.push({
    key: 'alarms',
    kicker: will('wrapped.alarm'),
    big: fmt(tr, s.earlyWakeups),
    unit: t('wrapped.alarm.unit', { n: s.earlyWakeups }),
    lines: [
      s.earlyWakeups === 0 ? t('wrapped.alarm.none') : t('wrapped.alarm.some'),
      s.lateEvenings > 0 ? count('wrapped.late', s.lateEvenings) : t('wrapped.lateNone'),
      ...(s.fridays > 0 ? [count('wrapped.fridays', s.fridays)] : []),
    ],
  });

  const km = s.walkMeters >= 1000;
  const walkValue = km ? Number((s.walkMeters / 1000).toFixed(1)) : Math.round(s.walkMeters);
  slides.push({
    key: 'walk',
    kicker: will('wrapped.walk'),
    big: km ? fixed(tr, s.walkMeters / 1000, 1) : fmt(tr, s.walkMeters),
    unit: t(km ? 'wrapped.km' : 'wrapped.m', { n: walkValue }),
    lines: [
      count('wrapped.steps', stepsFor(s.walkMeters)),
      s.walkMeters > 0 ? t('wrapped.fun', { fun: funText(tr, s.walkMeters) }) : t('wrapped.sameBuilding'),
    ],
  });

  slides.push({
    key: 'gaps',
    kicker: will('wrapped.gaps'),
    big: fmt(tr, s.gapHours),
    unit: t('wrapped.gaps.unit', { n: s.gapHours }),
    lines: [s.gapHours === 0 ? t('wrapped.gaps.none') : count('wrapped.gaps.coffee', (s.gapHours * 60) / 20)],
  });

  if (commuteMinutes > 0) {
    slides.push({
      key: 'commute',
      kicker: will('wrapped.road'),
      big: fmt(tr, s.commuteHours),
      unit: t('wrapped.road.unit', { n: s.commuteHours }),
      lines: [
        count('wrapped.road.days', s.campusDays, { m: commuteMinutes }),
        s.commuteHours >= 10 ? count('wrapped.road.books', s.commuteHours / 10) : t('wrapped.road.short'),
      ],
    });
  }

  if (s.hellDay) {
    slides.push({
      key: 'hell',
      kicker: will('wrapped.hell'),
      big: tr.day(s.hellDay.day, 'long'),
      lines: [
        s.scope === 'year'
          ? t('wrapped.hell.pointsYear', { n: s.hellDay.score, term: tr.term(s.hellDay.semester, 'long') })
          : t('wrapped.hell.points', { n: s.hellDay.score }),
        t('wrapped.hell.nice'),
      ],
    });
  }

  slides.push({ key: 'final', kicker: t('wrapped.final'), lines: [] });
  return slides;
}

/** Картинка для сторис 1080×1920, рисуется в браузере. */
async function renderStory(tr: Translator, s: WrappedStats): Promise<Blob | null> {
  const { t } = tr;
  const named = titleText(tr, s.title);
  // В Caveat нет иврита — для рукописных строк на иврите берём Rubik.
  const handFamily = tr.lang === 'he' ? '"Rubik Variable", system-ui, sans-serif' : '"Caveat Variable", cursive';
  try {
    // Текст-образец, чтобы подгрузились нужные подмножества шрифта (кириллица, иврит).
    const sample = `BarSuffer ${named.title} ${named.blurb} ${t('wrapped.canvas.index')}`;
    await Promise.all([
      document.fonts.load(`700 120px ${handFamily}`, sample),
      document.fonts.load('800 80px "Rubik Variable"', sample),
      document.fonts.load('400 38px "Rubik Variable"', sample),
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

  /** Латиница (логотип, цифры) — всегда Caveat; переводимые рукописные строки — handFamily. */
  const hand = (size: number) => `700 ${size}px "Caveat Variable", cursive`;
  const handText = (size: number) => `700 ${size}px ${handFamily}`;
  const ui = (weight: number, size: number) => `${weight} ${size}px "Rubik Variable", system-ui, sans-serif`;
  ctx.direction = tr.dir;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';

  ctx.font = hand(110);
  ctx.fillText('BarSuffer Wrapped', W / 2, 200);
  ctx.font = ui(500, 44);
  ctx.fillStyle = '#c9c3ff';
  ctx.fillText(scopeName(tr, s.scope), W / 2, 280, W - 80);

  ctx.font = ui(600, 40);
  ctx.fillStyle = '#9097a6';
  ctx.fillText(t('wrapped.canvas.index'), W / 2, 430);
  ctx.font = hand(400);
  ctx.fillStyle = s.score >= 70 ? '#ff5c5c' : s.score >= 40 ? '#f2b84b' : '#7fd17f';
  ctx.fillText(String(s.score), W / 2, 760);
  ctx.font = ui(600, 52);
  ctx.fillStyle = '#9097a6';
  ctx.fillText('/ 100', W / 2, 840);

  ctx.font = tr.lang === 'he' ? handText(100) : handText(120);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(named.title, W / 2, 1000, W - 80);
  ctx.font = ui(400, 38);
  ctx.fillStyle = '#c4c8d2';
  ctx.fillText(named.blurb, W / 2, 1070, W - 120);

  const cells: [string, string][] = [
    [fmt(tr, s.classHours), t('wrapped.hours.unit', { n: s.classHours })],
    [fmt(tr, s.earlyWakeups), t('wrapped.grid.alarms', { n: s.earlyWakeups })],
    [distance(tr, s.walkMeters), t('wrapped.canvas.walked')],
    [fmt(tr, s.gapHours), t('wrapped.grid.gaps', { n: s.gapHours })],
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
    ctx.fillText(value, x, y, 420);
    ctx.font = ui(500, 34);
    ctx.fillStyle = '#9097a6';
    ctx.fillText(label, x, y + 52, 420);
  });

  if (s.hellDay) {
    ctx.font = ui(600, 42);
    ctx.fillStyle = '#ffb08a';
    ctx.fillText(t('wrapped.canvas.hell', { day: tr.day(s.hellDay.day, 'long') }), W / 2, 1730, W - 80);
  }

  ctx.font = ui(600, 34);
  ctx.fillStyle = '#c9c3ff';
  // Адрес сайта — латиница, всегда слева направо.
  ctx.direction = 'ltr';
  ctx.fillText(SITE, W / 2, H - 110, W - 80);
  ctx.direction = tr.dir;
  ctx.font = ui(500, 28);
  ctx.fillStyle = '#7c8394';
  ctx.fillText(t('wrapped.canvas.footer'), W / 2, H - 62, W - 80);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function Wrapped({ plan, courses, commuteMinutes, gate, now, initialScope, onClose }: Props) {
  const [scope, setScope] = useState<WrappedScope>(initialScope);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tr = useI18n();
  const { t } = tr;

  const stats = useMemo(
    () => computeWrapped(plan, courses, scope, { commuteMinutes, gate: gate || undefined }, now),
    [plan, courses, scope, commuteMinutes, gate, now],
  );
  const slides = useMemo(() => buildSlides(tr, stats, commuteMinutes), [tr, stats, commuteMinutes]);
  const named = titleText(tr, stats.title);
  const slide = slides[Math.min(index, slides.length - 1)]!;
  const last = index >= slides.length - 1;

  useEffect(() => rootRef.current?.focus(), []);
  useEffect(() => setIndex(0), [scope]);

  const next = () => setIndex((i) => Math.min(i + 1, slides.length - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const save = async (share: boolean) => {
    setBusy(true);
    try {
      const blob = await renderStory(tr, stats);
      if (!blob) return;
      const file = new File([blob], `barsuffer-wrapped-${scope}.png`, { type: 'image/png' });
      if (share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t('wrapped.shareTitle') });
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
        // В иврите «вперёд» — влево.
        const forward = tr.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
        const back = tr.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === forward || e.key === ' ') {
          e.preventDefault();
          next();
        } else if (e.key === back) {
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
            <div className="sem-tabs" role="tablist" aria-label={t('wrapped.periodTabs')}>
              {SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={scope === s}
                  className={scope === s ? 'on' : ''}
                  onClick={() => setScope(s)}
                >
                  {scopeLabel(tr, s)}
                </button>
              ))}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('wrapped.close')}>
              ×
            </button>
          </div>
        </div>

        {stats.empty ? (
          <div className="story-body">
            <p className="story-kicker">BarSuffer Wrapped</p>
            <p className="story-big">{t('wrapped.nothing')}</p>
            <p className="story-line">{t('wrapped.empty', { scope: scopeName(tr, scope) })}</p>
          </div>
        ) : slide.key === 'final' ? (
          <div className="story-body">
            <p className="story-kicker">{slide.kicker}</p>
            <p className={`story-score level-${stats.score >= 70 ? 'high' : stats.score >= 40 ? 'mid' : 'low'}`}>
              {stats.score}
              <small>/100</small>
            </p>
            <p className="story-title">{named.title}</p>
            <p className="story-line">{named.blurb}</p>
            <div className="story-grid">
              <span><b>{fmt(tr, stats.classHours)}</b>{t('wrapped.hours.unit', { n: stats.classHours })}</span>
              <span><b>{fmt(tr, stats.earlyWakeups)}</b>{t('wrapped.grid.alarms', { n: stats.earlyWakeups })}</span>
              <span><b>{distance(tr, stats.walkMeters)}</b>{t('wrapped.grid.walked')}</span>
              <span><b>{fmt(tr, stats.gapHours)}</b>{t('wrapped.grid.gaps', { n: stats.gapHours })}</span>
            </div>
            <div className="story-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>
                {t('wrapped.share')}
              </button>
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void save(false)}>
                {t('wrapped.save')}
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
              aria-label={t('wrapped.prev')}
            />
            <button
              type="button"
              className="story-tap next"
              onClick={next}
              disabled={last}
              aria-label={t('wrapped.next')}
            />
          </>
        )}
        <p className="story-foot">
          {t('wrapped.foot', { i: index + 1, total: slides.length })}
        </p>
      </div>
    </div>
  );
}
