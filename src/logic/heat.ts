/**
 * Хамсин: жара в часы, когда студент в кампусе. Порог 32° — «возьмите воду», 35° — «серьёзно».
 * Температура — из того же прогноза Open-Meteo (temperature_2m), время местное "YYYY-MM-DDTHH:00".
 */

export const HOT_C = 32;
export const EXTREME_C = 35;

export interface HeatWarning {
  /** Максимум за время в кампусе, °C. */
  max: number;
  /** Час максимума, минуты от полуночи. */
  at: number;
  level: 'hot' | 'extreme';
  /** Сколько минут пешком за день — чем больше, тем важнее вода. */
  walkMinutes: number;
}

export function heatWarning(
  hourly: { time: readonly string[]; temperature_2m?: readonly (number | null)[] },
  date: string,
  campus: { start: number; end: number } | null,
  walkMinutes: number,
): HeatWarning | null {
  const temps = hourly.temperature_2m;
  if (!campus || !temps) return null;
  let best: { max: number; at: number } | null = null;
  for (let h = Math.floor(campus.start / 60); h * 60 < campus.end; h++) {
    const i = hourly.time.indexOf(`${date}T${String(h).padStart(2, '0')}:00`);
    const t = i === -1 ? null : temps[i];
    if (t === null || t === undefined) continue;
    if (!best || t > best.max) best = { max: t, at: h * 60 };
  }
  if (!best || best.max < HOT_C) return null;
  return { ...best, max: Math.round(best.max), level: best.max >= EXTREME_C ? 'extreme' : 'hot', walkMinutes };
}
