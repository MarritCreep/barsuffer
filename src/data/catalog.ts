import type { Catalog, Course } from './types';
import sample from './sample-2027.json';

/** Текущий снимок каталога. Пока это ручной образец — см. metadata.notes. */
export const catalog = sample as Catalog;

export const courseMap: ReadonlyMap<string, Course> = new Map(
  catalog.courses.map((c) => [c.courseId, c]),
);
