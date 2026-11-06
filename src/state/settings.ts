import { MISERY_WEIGHTS, type MiseryWeights } from '../logic/misery';

const KEY = 'barsuffer:settings:v1';
/** Раньше ворота хранились отдельно картой — подхватываем старое значение. */
const LEGACY_GATE_KEY = 'barsuffer:map-gate';

/** Личные настройки, только в браузере. */
export interface Settings {
  /** Дорога в кампус в одну сторону, минуты. 0 — не считать. */
  commuteMinutes: number;
  /** Свои веса индекса для автоподбора. */
  weights: MiseryWeights;
  /** Через какие ворота студент входит в кампус ('' — не учитывать). */
  gate: string;
}

export const DEFAULT_SETTINGS: Settings = { commuteMinutes: 0, weights: { ...MISERY_WEIGHTS }, gate: '' };

/** Проверяет и чистит настройки из любого источника (localStorage, файл резервной копии). */
export function sanitizeSettings(value: unknown): Settings {
  const parsed = (typeof value === 'object' && value !== null ? value : {}) as Partial<Settings>;
  const weights: MiseryWeights = { ...MISERY_WEIGHTS };
  for (const k of Object.keys(weights) as (keyof MiseryWeights)[]) {
    const v = parsed.weights?.[k];
    if (typeof v === 'number' && v >= 0 && v <= 50) weights[k] = v;
  }
  const commute = parsed.commuteMinutes;
  const gate = typeof parsed.gate === 'string' ? parsed.gate : '';
  return {
    commuteMinutes: typeof commute === 'number' && commute >= 0 && commute <= 300 ? commute : 0,
    weights,
    gate: /^gate-\d+$/.test(gate) ? gate : '',
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeSettings(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_GATE_KEY);
    return sanitizeSettings({ gate: legacy ? (JSON.parse(legacy) as string) : '' });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* хранилище недоступно */
  }
}
