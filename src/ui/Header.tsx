import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogMetadata } from '../data/types';
import { LANGS, isLang } from '../i18n/core';
import { useI18n } from '../i18n/I18n';
import type { Appearance } from '../state/appearance';
import { ThemePicker } from './ThemePicker';

/** Гифка лежит в public/ и грузится только при нажатии на кнопку. */
const SUFFER_GIF = `${import.meta.env.BASE_URL}skeleton-burning.gif`;

/** Шуточное окно «SUFFER»: горящий скелет. Закрывается крестиком, кликом мимо или Esc. */
function SufferGif({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
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
        aria-label={t('header.sufferDialog')}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="icon-btn suffer-close" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
        <img src={SUFFER_GIF} alt={t('header.sufferAlt')} />
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

export function Header(props: Props) {
  const { metadata, appearance, onPreviewAppearance, onApplyAppearance, canUndo, canRedo, onUndo, onRedo } = props;
  const { t, lang, setLang } = useI18n();
  const [suffer, setSuffer] = useState(false);
  return (
    <header className="header">
      <div className="brand-col">
        <div className="brand">
          <span className="logo" dir="ltr">
            Bar<span className="logo-accent">Suffer</span>
          </span>
          <span className="pill">{t('header.unofficial')}</span>
        </div>
        <button type="button" className="suffer-btn" onClick={() => setSuffer(true)}>
          <span className="suffer-flames" aria-hidden="true" />
          <span className="suffer-text">{t('header.suffer')}</span>
        </button>
      </div>
      {suffer && <SufferGif onClose={() => setSuffer(false)} />}
      <div className="header-meta">
        <span className="snapshot" title={metadata.source}>
          <bdi dir="rtl" lang="he">{metadata.yearHebrew}</bdi> · {t('header.data', { date: metadata.updatedAt })}
          {metadata.isSample && ` · ${t('header.sample')}`}
        </span>
        <select
          className="lang-select"
          value={lang}
          onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}
          aria-label={t('header.language')}
          title={t('header.language')}
        >
          {LANGS.map((l) => (
            <option key={l.id} value={l.id} lang={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <span className="history-btns">
          <button
            type="button"
            className="icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t('common.undo')}
            title={t('header.undoTitle', { keys: isMac ? '⌘Z' : 'Ctrl+Z' })}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="flip-rtl">
              <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={t('common.redo')}
            title={t('header.redoTitle', { keys: isMac ? '⌘⇧Z' : 'Ctrl+Y' })}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="flip-rtl">
              <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
        <ThemePicker appearance={appearance} onPreview={onPreviewAppearance} onApply={onApplyAppearance} />
      </div>
    </header>
  );
}
