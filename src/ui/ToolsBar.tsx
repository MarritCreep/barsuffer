import { useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';

export type Tool = 'calendar' | 'friend' | 'attendance' | 'exams' | 'degree' | 'tour';

const TOOLS: { id: Tool; icon: string; label: MessageKey; hint: MessageKey }[] = [
  { id: 'calendar', icon: '📅', label: 'tools.calendar', hint: 'tools.calendarHint' },
  { id: 'friend', icon: '🤝', label: 'tools.friend', hint: 'tools.friendHint' },
  { id: 'attendance', icon: '🪖', label: 'tools.attendance', hint: 'tools.attendanceHint' },
  { id: 'exams', icon: '📝', label: 'tools.exams', hint: 'tools.examsHint' },
  { id: 'degree', icon: '🎓', label: 'tools.degree', hint: 'tools.degreeHint' },
  { id: 'tour', icon: '👋', label: 'tools.tour', hint: 'tools.tourHint' },
];

/** На десктопе — ряд кнопок над «Сегодня», на телефоне — вкладка «Ещё» со списком. */
export function ToolsBar({ onOpen }: { onOpen: (tool: Tool) => void }) {
  const { t } = useI18n();
  return (
    <nav className="tools-bar" aria-label={t('tools.title')}>
      <h2 className="tools-title">{t('tools.title')}</h2>
      <ul>
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <button type="button" className="tool-btn" onClick={() => onOpen(tool.id)} title={t(tool.hint)} data-tool={tool.id}>
              <span className="tool-icon" aria-hidden="true">
                {tool.icon}
              </span>
              <span className="tool-label">{t(tool.label)}</span>
              <span className="tool-hint" aria-hidden="true">
                {t(tool.hint)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
