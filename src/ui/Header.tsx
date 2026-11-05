import type { CatalogMetadata } from '../data/types';
import type { Theme } from '../state/storage';

interface Props {
  metadata: CatalogMetadata;
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({ metadata, theme, onToggleTheme }: Props) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <header className="header">
      <div className="brand">
        <span className="logo">
          Bar<span className="logo-accent">Suffer</span>
        </span>
        <span className="pill">Unofficial</span>
      </div>
      <div className="header-meta">
        <span className="snapshot" title={metadata.source}>
          <bdi dir="rtl" lang="he">{metadata.yearHebrew}</bdi> · data {metadata.updatedAt}
          {metadata.isSample && ' · sample'}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={`Switch to ${next} theme`}
          title={`Switch to ${next} theme`}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </g>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
