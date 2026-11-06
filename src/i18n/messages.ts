import type { Lang, Msg } from './core';
import attendance from './areas/attendance';
import common from './areas/common';
import courses from './areas/courses';
import degree from './areas/degree';
import dialogs from './areas/dialogs';
import exams from './areas/exams';
import features from './areas/features';
import map from './areas/map';
import today from './areas/today';
import week from './areas/week';
import wrapped from './areas/wrapped';

/**
 * Все словари. Каждая область (areas/*.ts) — свой файл с en/ru/he, ключи с префиксом области.
 * Тип ru/he = Dict<typeof en>, так что пропущенный перевод не соберётся.
 */
const en = {
  ...common.en,
  ...courses.en,
  ...dialogs.en,
  ...week.en,
  ...wrapped.en,
  ...map.en,
  ...today.en,
  ...features.en,
  ...attendance.en,
  ...exams.en,
  ...degree.en,
};

export type MessageKey = keyof typeof en;

export const MESSAGES: Record<Lang, Record<MessageKey, Msg>> = {
  en,
  ru: {
    ...common.ru,
    ...courses.ru,
    ...dialogs.ru,
    ...week.ru,
    ...wrapped.ru,
    ...map.ru,
    ...today.ru,
    ...features.ru,
    ...attendance.ru,
    ...exams.ru,
    ...degree.ru,
  },
  he: {
    ...common.he,
    ...courses.he,
    ...dialogs.he,
    ...week.he,
    ...wrapped.he,
    ...map.he,
    ...today.he,
    ...features.he,
    ...attendance.he,
    ...exams.he,
    ...degree.he,
  },
};
