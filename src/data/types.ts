/**
 * Модель каталога. Своя структура (см. диздок, раздел «Модель данных»),
 * расширенная под все типы занятий, годовые курсы и привязку упражнений.
 */

/** 1 = воскресенье (יום א׳) … 6 = пятница (יום ו׳). Суббота не используется. */
export type Day = 1 | 2 | 3 | 4 | 5 | 6;

export type SessionType =
  | 'lecture' // שיעור
  | 'exercise' // תרגיל
  | 'lab' // מעבדה
  | 'seminar' // סמינריון
  | 'proseminar' // פרוסמינריון
  | 'workshop' // סדנה
  | 'guidance' // הדרכה
  | 'other';

/** Семестр, к которому относится курс. `year` — годовой курс (оба семестра). */
export type Term = 'A' | 'B' | 'year';

export type Semester = 'A' | 'B';

export interface Meeting {
  day: Day;
  /** "HH:MM", 24-часовой формат */
  startTime: string;
  endTime: string;
  building?: string;
  room?: string;
  /**
   * Только для годовых курсов: встреча идёт лишь в одном семестре.
   * Если не указано — встреча идёт во всех семестрах курса.
   */
  semester?: Semester;
}

export interface Section {
  /** Стабильный номер группы, например "18". Используется в сохранённых расписаниях. */
  sectionNumber: string;
  type: SessionType;
  lecturer?: string;
  /** Пустой массив — занятие без фиксированного времени (онлайн, асинхронно). */
  schedule: Meeting[];
  /**
   * Номера групп другого типа, с которыми эту группу можно брать.
   * Например, упражнение 20 привязано к лекции 18: linkedTo: ["18"].
   * Если не указано — группу можно брать с любой.
   */
  linkedTo?: string[];
  /** Группа придумана для демонстрации, в реальном каталоге её нет. */
  isDemo?: boolean;
}

export interface Exam {
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
}

export interface Course {
  /** Номер курса, например "71204". */
  courseId: string;
  name: string;
  /** נקודות זכות. null — неизвестно. */
  credits: number | null;
  term: Term;
  sections: Section[];
  exams?: { moedA?: Exam; moedB?: Exam };
  /** Курс целиком придуман для демонстрации. */
  isDemo?: boolean;
}

export interface CatalogMetadata {
  /** Академический год по окончанию, например "2027" для 2026–2027. */
  year: string;
  yearHebrew: string;
  departmentId: string;
  /** Дата снимка, YYYY-MM-DD. Всегда показывается в интерфейсе. */
  updatedAt: string;
  source: string;
  isSample: boolean;
  notes?: string[];
}

export interface Catalog {
  metadata: CatalogMetadata;
  courses: Course[];
}

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  lecture: 'Lecture',
  exercise: 'Exercise',
  lab: 'Lab',
  seminar: 'Seminar',
  proseminar: 'Proseminar',
  workshop: 'Workshop',
  guidance: 'Guidance',
  other: 'Other',
};

/** Порядок типов в интерфейсе. */
export const SESSION_TYPE_ORDER: SessionType[] = [
  'lecture',
  'seminar',
  'proseminar',
  'workshop',
  'exercise',
  'lab',
  'guidance',
  'other',
];

export const DAY_LABEL: Record<Day, string> = {
  1: 'Sun',
  2: 'Mon',
  3: 'Tue',
  4: 'Wed',
  5: 'Thu',
  6: 'Fri',
};

export const DAYS: Day[] = [1, 2, 3, 4, 5, 6];
