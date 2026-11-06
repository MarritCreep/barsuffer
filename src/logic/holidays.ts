import { NO_CLASS_PERIODS, type NoClassPeriod } from '../data/calendar';
import { toMinutes } from './time';

/** Праздник/перерыв в этот день (YYYY-MM-DD) или undefined. */
export function periodOn(date: string, periods: readonly NoClassPeriod[] = NO_CLASS_PERIODS): NoClassPeriod | undefined {
  return periods.find((p) => p.from <= date && date <= p.to);
}

/** Что праздник делает со встречей: отменяет, укорачивает или ничего. */
export function holidayEffect(
  m: { start: number; end: number },
  period: NoClassPeriod | undefined,
): 'cancelled' | 'shortened' | null {
  if (!period) return null;
  if (period.off) return 'cancelled';
  let shortened = false;
  if (period.until) {
    const until = toMinutes(period.until);
    if (m.start >= until) return 'cancelled';
    if (m.end > until) shortened = true;
  }
  if (period.pause) {
    const [ps, pe] = period.pause.map(toMinutes) as [number, number];
    if (m.start >= ps && m.end <= pe) return 'cancelled';
    if (m.start < pe && m.end > ps) shortened = true;
  }
  return shortened ? 'shortened' : null;
}

/** Ближайшие праздники, начиная с даты (включая идущий сейчас), не дальше `days` дней. */
export function upcomingPeriods(
  today: string,
  days: number,
  periods: readonly NoClassPeriod[] = NO_CLASS_PERIODS,
): NoClassPeriod[] {
  const [y, m, d] = today.split('-').map(Number);
  const limit = new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
  return periods.filter((p) => p.to >= today && p.from <= limit).sort((a, b) => a.from.localeCompare(b.from));
}
