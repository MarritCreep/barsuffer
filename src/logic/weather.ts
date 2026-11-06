import type { DayJourney } from './campus';

/**
 * Предупреждение о дожде. Прогноз — бесплатный Open-Meteo (open-meteo.com), без ключа.
 * Отправляются только координаты кампуса; никаких данных студента.
 */
export const CAMPUS_LAT = 32.0686;
export const CAMPUS_LON = 34.8432;
export const FORECAST_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${CAMPUS_LAT}&longitude=${CAMPUS_LON}` +
  '&hourly=precipitation_probability,precipitation,temperature_2m&timezone=Asia%2FJerusalem&forecast_days=3';

/** Ответ Open-Meteo (нужные поля). Время — местное, "YYYY-MM-DDTHH:00". */
export interface HourlyForecast {
  time: string[];
  precipitation_probability: (number | null)[];
  precipitation: (number | null)[];
  /** °C; для предупреждения о жаре (хамсин). В старом кеше может не быть. */
  temperature_2m?: (number | null)[];
}

export const RAIN_PROBABILITY = 50;
export const RAIN_MM = 0.3;
/** Короткие переходы — не повод для зонта. */
export const MIN_WALK_FOR_WARNING = 3;

export function isForecast(value: unknown): value is HourlyForecast {
  const v = value as Partial<HourlyForecast> | null;
  return (
    !!v &&
    Array.isArray(v.time) &&
    Array.isArray(v.precipitation_probability) &&
    Array.isArray(v.precipitation)
  );
}

/** Вероятность и количество осадков на час, в который попадает время (минуты от полуночи). */
export function rainAt(forecast: HourlyForecast, date: string, minutes: number) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const i = forecast.time.indexOf(`${date}T${hour}:00`);
  if (i === -1) return null;
  return { prob: forecast.precipitation_probability[i] ?? 0, mm: forecast.precipitation[i] ?? 0 };
}

export interface RainWarning {
  /** Когда идти (минуты от полуночи). */
  at: number;
  prob: number;
  mm: number;
  walk: number;
  /** Откуда и куда: номер здания или id ворот ('gate-40'); текст делает интерфейс. */
  from: string;
  to: string;
}

/** Переходы дня (от ворот, между парами, к воротам), которые попадают под дождь. `gate` — id ворот. */
export function rainWarnings(
  forecast: HourlyForecast,
  date: string,
  journey: DayJourney,
  gate?: string,
): RainWarning[] {
  const walks: { at: number; walk: number | null; from: string; to: string }[] = [];
  const first = journey.stops[0];
  const last = journey.stops[journey.stops.length - 1];
  const where = (building?: string) => building ?? '?';
  if (first && journey.arrive !== null && gate) {
    walks.push({ at: first.start - journey.arrive, walk: journey.arrive, from: gate, to: where(first.building) });
  }
  for (const leg of journey.legs) {
    walks.push({ at: leg.from.end, walk: leg.walk, from: where(leg.from.building), to: where(leg.to.building) });
  }
  if (last && journey.leave !== null && gate) {
    walks.push({ at: last.end, walk: journey.leave, from: where(last.building), to: gate });
  }

  const warnings: RainWarning[] = [];
  for (const w of walks) {
    if (w.walk === null || w.walk < MIN_WALK_FOR_WARNING) continue;
    const r = rainAt(forecast, date, w.at);
    if (!r || (r.prob < RAIN_PROBABILITY && r.mm < RAIN_MM)) continue;
    warnings.push({
      at: w.at,
      prob: r.prob,
      mm: r.mm,
      walk: w.walk,
      from: w.from,
      to: w.to,
    });
  }
  return warnings;
}
