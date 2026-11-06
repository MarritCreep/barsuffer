import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogMetadata } from '../data/types';
import type { Appearance } from '../state/appearance';
import { ThemePicker } from './ThemePicker';

/** Гифка лежит в public/ и грузится только при нажатии на кнопку. */
const SUFFER_GIF = `${import.meta.env.BASE_URL}skeleton-burning.gif`;

/** Шуточное окно «SUFFER»: горящий скелет. Закрывается крестиком, кликом мимо или Esc. */
function SufferGif({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // В body: у шапки backdrop-filter, внутри неё position: fixed считается от шапки, а не от экрана.
  return createPortal(
    <div className="suffer-backdrop" onClick={onClose}>
      <div
        className="suffer-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome home"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="icon-btn suffer-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <img src={SUFFER_GIF} alt="A skeleton burning in flames, arms raised: “Welcome home!”" />
      </div>
    </div>,
    document.body,
  );
}

interface Props {
  metadata: CatalogMetadata;
  appearance: Appearance;
  onPreviewAppearance: (a: Appearance) => void;
  onApplyAppearance: (a: Appearance) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

export function Header(props: Props) {
  const { metadata, appearance, onPreviewAppearance, onApplyAppearance, canUndo, canRedo, onUndo, onRedo } = props;
  const [suffer, setSuffer] = useState(false);
  return (
    <header className="header">
      <div className="brand-col">
        <div className="brand">
          <span className="logo">
            Bar<span className="logo-accent">Suffer</span>
          </span>
          <span className="pill">Unofficial</span>
        </div>
        <button type="button" className="suffer-btn" onClick={() => setSuffer(true)}>
          <span className="suffer-flames" aria-hidden="true" />
          <span className="suffer-text">SUFFER</span>
        </button>
      </div>
      {suffer && <SufferGif onClose={() => setSuffer(false)} />}
      <div className="header-meta">
        <span className="snapshot" title={metadata.source}>
          <bdi dir="rtl" lang="he">{metadata.yearHebrew}</bdi> · data {metadata.updatedAt}
          {metadata.isSample && ' · sample'}
        </span>
        <span className="history-btns">
          <button
            type="button"
            className="icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title={`Undo (${MOD}Z)`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title={`Redo (${isMac ? '⌘⇧Z' : 'Ctrl+Y'})`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
        <ThemePicker appearance={appearance} onPreview={onPreviewAppearance} onApply={onApplyAppearance} />
      </div>
    </header>
  );
}
