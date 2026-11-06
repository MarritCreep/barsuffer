import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';

export type TourTab = 'courses' | 'week' | 'more' | 'today';

interface Step {
  /** Селекторы по порядку: берётся первый видимый (на телефоне и десктопе элементы разные). */
  targets: string[];
  /** Какую вкладку открыть на телефоне. */
  tab: TourTab;
  title: MessageKey;
  body: MessageKey;
}

const STEPS: Step[] = [
  { targets: ['.pane-courses'], tab: 'courses', title: 'tour.coursesTitle', body: 'tour.coursesBody' },
  { targets: ['.week-grid', '.pane-week'], tab: 'week', title: 'tour.weekTitle', body: 'tour.weekBody' },
  { targets: ['.stats .misery', '.stats'], tab: 'week', title: 'tour.indexTitle', body: 'tour.indexBody' },
  { targets: ['.tools-bar'], tab: 'more', title: 'tour.toolsTitle', body: 'tour.toolsBody' },
  { targets: ['.header-meta'], tab: 'courses', title: 'tour.settingsTitle', body: 'tour.settingsBody' },
];

function visible(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

interface Props {
  /** Начать сразу с шагов (из меню), а не с приветствия. */
  skipWelcome?: boolean;
  onTab: (tab: TourTab) => void;
  onDemo: () => void;
  onClose: () => void;
}

/** Первое знакомство: приветствие (пример расписания / тур / с нуля) и пять подсвеченных шагов. */
export function Tour({ skipWelcome = false, onTab, onDemo, onClose }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(skipWelcome ? 0 : -1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const current = step >= 0 ? STEPS[step] : undefined;

  useEffect(() => {
    if (current) onTab(current.tab);
  }, [current, onTab]);

  // Найти цель после переключения вкладки и следить за прокруткой/размером окна.
  useLayoutEffect(() => {
    if (!current) {
      setRect(null);
      return;
    }
    let el: HTMLElement | null = null;
    const measure = () => {
      el = current.targets.map(visible).find(Boolean) ?? null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const id = window.requestAnimationFrame(() => {
      measure();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      window.setTimeout(measure, 350);
    });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [current]);

  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const pad = 6;
  // Карточка — под целью, если снизу хватает места, иначе над ней; без цели — по центру.
  const cardStyle: CSSProperties = {};
  // Высокая цель (список курсов) — карточка просто внизу экрана поверх неё.
  if (rect) {
    const h = window.innerHeight;
    if (h - rect.bottom > 220) cardStyle.top = rect.bottom + pad + 10;
    else if (rect.top > 220) cardStyle.bottom = h - rect.top + pad + 10;
    else cardStyle.bottom = 16;
  }

  return createPortal(
    <div className={`tour ${rect ? 'has-target' : ''}`}>
      {rect ? (
        <div
          className="tour-spot"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          aria-hidden="true"
        />
      ) : (
        <div className="tour-shade" aria-hidden="true" />
      )}
      <div
        ref={cardRef}
        className={`tour-card ${rect ? 'anchored' : 'centered'}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.label')}
      >
        {step < 0 || !current ? (
          <>
            <strong className="tour-title">{t('tour.welcomeTitle')}</strong>
            <p>{t('tour.welcomeBody')}</p>
            <div className="tour-actions stacked">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onDemo();
                  setStep(0);
                }}
              >
                {t('tour.demo')}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setStep(0)}>
                {t('tour.start')}
              </button>
              <button type="button" className="link-btn" onClick={onClose}>
                {t('tour.scratch')}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="pick-label">{t('tour.step', { n: step + 1, total: STEPS.length })}</span>
            <strong className="tour-title">{t(current.title)}</strong>
            <p>{t(current.body)}</p>
            <div className="tour-actions">
              <button type="button" className="link-btn" onClick={onClose}>
                {t('common.skip')}
              </button>
              <span className="tour-nav">
                {step > 0 && (
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => setStep(step - 1)}>
                    {t('common.back')}
                  </button>
                )}
                {step < STEPS.length - 1 ? (
                  <button type="button" className="btn btn-small" onClick={() => setStep(step + 1)}>
                    {t('common.next')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-small" onClick={onClose}>
                    {t('tour.done')}
                  </button>
                )}
              </span>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
