import type { Term } from '../data/types';
import { SESSION_TYPE_LABEL, type SessionType } from '../data/types';
import { formatMinutes } from '../logic/time';

export const TERM_LABEL: Record<Term, string> = {
  A: 'Sem A',
  B: 'Sem B',
  year: 'Yearly',
};

export function timeRange(start: number, end: number): string {
  return `${formatMinutes(start)}–${formatMinutes(end)}`;
}

export function sessionLabel(type: SessionType, sectionNumber: string): string {
  return `${SESSION_TYPE_LABEL[type]} ${sectionNumber}`;
}

export function place(building?: string, room?: string): string {
  if (building && room) return `${building}-${room}`;
  return building ?? room ?? '';
}

export function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}
