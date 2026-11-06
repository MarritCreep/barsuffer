import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_ACCENT, hexToRgb, rgbToHex, type Appearance } from '../state/appearance';

interface Props {
  appearance: Appearance;
  /** Показать без сохранения (живой предпросмотр). */
  onPreview: (a: Appearance) => void;
  /** Сохранить. */
  onApply: (a: Appearance) => void;
}

const PRESETS: { name: string; hex: string }[] = [
  { name: 'Violet', hex: '#8b7cff' },
  { name: 'Blue', hex: '#3d8bff' },
  { name: 'Teal', hex: '#22c7b8' },
  { name: 'Green', hex: '#3fbf5a' },
  { name: 'Gold', hex: '#f2b84b' },
  { name: 'Orange', hex: '#ff7a1a' },
  { name: 'Red', hex: '#ff4d5e' },
  { name: 'Pink', hex: '#ff5fb0' },
];

const CHANNELS = ['R', 'G', 'B'] as const;

/** Кнопка темы в шапке и панель выбора: основа, цвет RGB, переливающийся туман. */
export function ThemePicker({ appearance, onPreview, onApply }: Props) {
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
  const [anchor, setAnchor] = useState({ top: 64, right: 16 });

  return (
    <span className="theme-picker">
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn theme-btn"
        onClick={() => {
          if (open) return cancel();
          const r = buttonRef.current?.getBoundingClientRect();
          if (r) setAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
          setInitial(appearance);
          setOpen(true);
        }}
        aria-label="Theme and colour"
        aria-expanded={open}
        title="Theme and colour"
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
            aria-label="Theme and colour"
            style={{ top: anchor.top, right: anchor.right }}
          >
            <strong className="theme-title">Theme</strong>

            <div className="sem-tabs" role="tablist" aria-label="Base theme">
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={draft.mode === m}
                  className={draft.mode === m ? 'on' : ''}
                  onClick={() => set({ mode: m })}
                >
                  {m === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>

            <div className="theme-color-row">
              <input
                type="color"
                value={color}
                onChange={(e) => set({ accent: e.target.value.toLowerCase() })}
                aria-label="Pick a colour"
              />
              <code className="theme-hex">{color}</code>
            </div>

            <div className="theme-sliders">
              {CHANNELS.map((ch, i) => (
                <label key={ch} className="weight-row">
                  <span>{ch}</span>
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
                    aria-label={`${ch === 'R' ? 'Red' : ch === 'G' ? 'Green' : 'Blue'} channel`}
                  />
                  <span className="weight-value">{rgb[i]}</span>
                </label>
              ))}
            </div>

            <div className="theme-presets" aria-label="Preset colours">
              {PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  className={`theme-preset ${color === p.hex ? 'on' : ''}`}
                  style={{ background: p.hex }}
                  onClick={() => set({ accent: p.hex })}
                  aria-label={p.name}
                  title={p.name}
                />
              ))}
            </div>

            <label className="block-row theme-fog">
              <input type="checkbox" checked={draft.fog} onChange={(e) => set({ fog: e.target.checked })} />
              Shimmering colour — a slow fog of your colour behind the page
            </label>

            <div className="modal-actions">
              <button type="button" className="link-btn" onClick={() => set({ accent: null, fog: false })}>
                Reset
              </button>
              <button type="button" className="btn btn-quiet" onClick={cancel}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onApply(draft);
                  setOpen(false);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}
