import { MISERY_WEIGHTS, type MiseryWeights } from '../logic/misery';

const KEY = 'barsuffer:settings:v1';

/** Личные настройки, только в браузере. */
export interface Settings {
  /** Дорога в кампус в одну сторону, минуты. 0 — не считать. */
  commuteMinutes: number;
  /** Свои веса индекса для автоподбора. */
  weights: MiseryWeights;
}

export const DEFAULT_SETTINGS: Settings = { commuteMinutes: 0, weights: { ...MISERY_WEIGHTS } };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const weights: MiseryWeights = { ...MISERY_WEIGHTS };
    for (const k of Object.keys(weights) as (keyof MiseryWeights)[]) {
      const v = parsed.weights?.[k];
      if (typeof v === 'number' && v >= 0 && v <= 50) weights[k] = v;
    }
    const commute = parsed.commuteMinutes;
    return {
      commuteMinutes: typeof commute === 'number' && commute >= 0 && commute <= 300 ? commute : 0,
      weights,
    };
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
