import type { Course } from '../data/types';
import type { Plan } from '../logic/selection';
import { sanitizeSettings, type Settings } from './settings';
import { isPlan } from './storage';

/**
 * Резервная копия в файл: расписание и личные настройки одним JSON-файлом.
 * Без аккаунтов — так расписание переносится между устройствами и переживает очистку браузера.
 */
export const BACKUP_APP = 'barsuffer';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  plan: Plan;
  settings: Settings;
}

export function makeBackup(plan: Plan, settings: Settings, now = new Date()): string {
  const backup: Backup = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), plan, settings };
  return JSON.stringify(backup, null, 2);
}

export function backupFileName(now = new Date()): string {
  return `barsuffer-${now.toISOString().slice(0, 10)}.json`;
}

export type ReadBackupResult =
  | { ok: true; plan: Plan; settings: Settings; dropped: string[] }
  | { ok: false; error: string };

/** Читает файл резервной копии; курсы, которых нет в каталоге, отбрасываются и перечисляются. */
export function readBackup(text: string, courses: ReadonlyMap<string, Course>): ReadBackupResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a BarSuffer file (not valid JSON).' };
  }
  const b = data as Partial<Backup> | null;
  if (!b || b.app !== BACKUP_APP) return { ok: false, error: 'This is not a BarSuffer file.' };
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    return { ok: false, error: 'This file was made by a newer version of BarSuffer.' };
  }
  if (!isPlan(b.plan)) return { ok: false, error: 'The schedule in this file is damaged.' };

  const dropped = b.plan.courses.filter((c) => !courses.has(c.courseId)).map((c) => c.courseId);
  const plan: Plan = { ...b.plan, courses: b.plan.courses.filter((c) => courses.has(c.courseId)) };
  return { ok: true, plan, settings: sanitizeSettings(b.settings), dropped };
}
