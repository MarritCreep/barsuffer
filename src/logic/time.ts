/** "HH:MM" → минуты от полуночи. */
export function toMinutes(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`Bad time: "${hhmm}"`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59) throw new Error(`Bad time: "${hhmm}"`);
  return h * 60 + m;
}

/** Минуты от полуночи → "HH:MM". */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
