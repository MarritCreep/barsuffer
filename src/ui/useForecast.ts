import { useEffect, useState } from 'react';
import { FORECAST_URL, isForecast, type HourlyForecast } from '../logic/weather';

const CACHE_KEY = 'barsuffer:weather:v1';
const MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Прогноз осадков для кампуса (Open-Meteo), кешируется на час.
 * Если сеть или сервис недоступны — просто null, сайт работает дальше.
 */
export function useForecast(): HourlyForecast | null {
  const [forecast, setForecast] = useState<HourlyForecast | null>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { at: number; data: unknown } | null;
      return cached && Date.now() - cached.at < MAX_AGE_MS && isForecast(cached.data) ? cached.data : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (forecast) return;
    const controller = new AbortController();
    fetch(FORECAST_URL, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { hourly?: unknown } | null) => {
        if (!json || !isForecast(json.hourly)) return;
        setForecast(json.hourly);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: json.hourly }));
        } catch {
          /* хранилище недоступно */
        }
      })
      .catch(() => {
        /* нет сети — без прогноза */
      });
    return () => controller.abort();
  }, [forecast]);

  return forecast;
}
