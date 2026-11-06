import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import { DEFAULT_ACCENT, hexToRgb, rgbToHex, type Appearance } from '../state/appearance';

interface Props {
  appearance: Appearance;
  /** Показать без сохранения (живой предпросмотр). */
  onPreview: (a: Appearance) => void;
  /** Сохранить. */
  onApply: (a: Appearance) => void;
}

const PRESETS: { name: MessageKey; hex: string }[] = [
  { name: 'theme.preset.violet', hex: '#8b7cff' },
  { name: 'theme.preset.blue', hex: '#3d8bff' },
  { name: 'theme.preset.teal', hex: '#22c7b8' },
  { name: 'theme.preset.green', hex: '#3fbf5a' },
  { name: 'theme.preset.gold', hex: '#f2b84b' },
  { name: 'theme.preset.orange', hex: '#ff7a1a' },
  { name: 'theme.preset.red', hex: '#ff4d5e' },
  { name: 'theme.preset.pink', hex: '#ff5fb0' },
];

const CHANNELS = [
  { short: 'R', label: 'theme.red' },
  { short: 'G', label: 'theme.green' },
  { short: 'B', label: 'theme.blue' },
] as const;

/** Кнопка темы в шапке и панель выбора: основа, цвет RGB, переливающийся туман. */
export function ThemePicker({ appearance, onPreview, onApply }: Props) {
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState(appearance);
  const panelRef = useRef<HTMLDivElement>(null);
  const draft = appearance; // предпросмотр живёт в состоянии приложения
  const color = draft.accent ?? DEFAULT_ACCENT[draft.mode];
  const rgb = hexToRgb(color);

  const cancel = () => {
    onPreview(initial);
    setOpen(false);
  };

  // Фокус — один раз при открытии (иначе ползунки теряли бы фокус при каждом движении).
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('button, input')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const set = (patch: Partial<Appearance>) => onPreview({ ...draft, ...patch });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left?: number; right?: number }>({ top: 64, right: 16 });

  return (
    <span className="theme-picker">
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn theme-btn"
        onClick={() => {
          if (open) return cancel();
          const r = buttonRef.current?.getBoundingClientRect();
          if (r)
            setAnchor(
              dir === 'rtl'
                ? { top: r.bottom + 8, left: Math.max(8, r.left) }
                : { top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) },
            );
          setInitial(appearance);
          setOpen(true);
        }}
        aria-label={t('theme.button')}
        aria-expanded={open}
        title={t('theme.button')}
      >
        <span className="theme-swatch" style={{ background: color }} aria-hidden="true" />
      </button>

      {open &&
        // Панель и подложка — в body: у шапки backdrop-filter, и position: fixed внутри неё
        // считался бы от шапки, а не от экрана.
        createPortal(
        <>
          <div className="theme-scrim" onClick={cancel} aria-hidden="true" />
          <div
            ref={panelRef}
            className="theme-panel"
            role="dialog"
            aria-label={t('theme.button')}
            style={{ top: anchor.top, left: anchor.left, right: anchor.right }}
          >
            <strong className="theme-title">{t('theme.title')}</strong>

            <div className="sem-tabs" role="tablist" aria-label={t('theme.base')}>
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={draft.mode === m}
                  className={draft.mode === m ? 'on' : ''}
                  onClick={() => set({ mode: m })}
                >
                  {m === 'dark' ? t('theme.dark') : t('theme.light')}
                </button>
              ))}
            </div>

            <div className="theme-color-row">
              <input
                type="color"
                value={color}
                onChange={(e) => set({ accent: e.target.value.toLowerCase() })}
                aria-label={t('theme.pick')}
              />
              <code className="theme-hex">{color}</code>
            </div>

            <div className="theme-sliders">
              {CHANNELS.map((ch, i) => (
                <label key={ch.short} className="weight-row">
                  <span>{ch.short}</span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={rgb[i]}
                    onChange={(e) => {
                      const next = [...rgb] as [number, number, number];
                      next[i] = Number(e.target.value);
                      set({ accent: rgbToHex(next) });
                    }}
                    aria-label={t(ch.label)}
                  />
                  <span className="weight-value">{rgb[i]}</span>
                </label>
              ))}
            </div>

            <div className="theme-presets" aria-label={t('theme.presets')}>
              {PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  className={`theme-preset ${color === p.hex ? 'on' : ''}`}
                  style={{ background: p.hex }}
                  onClick={() => set({ accent: p.hex })}
                  aria-label={t(p.name)}
                  title={t(p.name)}
                />
              ))}
            </div>

            <label className="block-row theme-fog">
              <input type="checkbox" checked={draft.fog} onChange={(e) => set({ fog: e.target.checked })} />
              {t('theme.fog')}
            </label>

            <div className="modal-actions">
              <button type="button" className="link-btn" onClick={() => set({ accent: null, fog: false })}>
                {t('common.reset')}
              </button>
              <button type="button" className="btn btn-quiet" onClick={cancel}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onApply(draft);
                  setOpen(false);
                }}
              >
                {t('common.apply')}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}
