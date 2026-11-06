import type { Theme } from './storage';

/** Оформление: светлая/тёмная основа, свой акцентный цвет и «переливающийся туман». */
export interface Appearance {
  mode: Theme;
  /** Свой акцентный цвет "#rrggbb"; null — стандартный фиолетовый. */
  accent: string | null;
  /** Цветной туман на фоне, медленно переливается. */
  fog: boolean;
}

const KEY = 'barsuffer:appearance:v1';
const THEME_KEY = 'barsuffer:theme'; // читает и скрипт в index.html до отрисовки

export const DEFAULT_ACCENT = { dark: '#8b7cff', light: '#5b4ce0' } as const;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Относительная яркость по WCAG (0…1). */
export function luminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Цвет текста на кнопке с этим фоном: тёмный на светлом, белый на тёмном. */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.4 ? '#0f1115' : '#ffffff';
}

/** Сдвиг оттенка (градусы) — для переливов тумана в тон выбранному цвету. */
export function shiftHue(hex: string, degrees: number): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + degrees + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

export function loadAppearance(): Appearance {
  try {
    const mode: Theme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>;
    return { mode, accent: isHex(raw.accent) ? raw.accent.toLowerCase() : null, fog: raw.fog === true };
  } catch {
    return { mode: 'dark', accent: null, fog: false };
  }
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(THEME_KEY, a.mode);
    localStorage.setItem(KEY, JSON.stringify({ accent: a.accent, fog: a.fog }));
  } catch {
    /* хранилище недоступно */
  }
}

/** Применить оформление к странице: тема и CSS-переменные акцента. */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = a.mode;
  const accent = a.accent ?? DEFAULT_ACCENT[a.mode];
  if (a.accent) {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--focus', accent);
    root.style.setProperty('--accent-text', readableOn(accent));
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--focus');
    root.style.removeProperty('--accent-text');
  }
  root.style.setProperty('--fog-1', accent);
  root.style.setProperty('--fog-2', shiftHue(accent, 35));
  root.style.setProperty('--fog-3', shiftHue(accent, -35));
}
