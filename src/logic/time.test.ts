import { describe, expect, it } from 'vitest';
import { formatMinutes, toMinutes } from './time';

describe('time', () => {
  it('parses HH:MM', () => {
    expect(toMinutes('08:00')).toBe(480);
    expect(toMinutes('19:30')).toBe(1170);
    expect(toMinutes('9:05')).toBe(545);
  });

  it('rejects bad input', () => {
    expect(() => toMinutes('8am')).toThrow();
    expect(() => toMinutes('25:00')).toThrow();
  });

  it('formats minutes', () => {
    expect(formatMinutes(480)).toBe('08:00');
    expect(formatMinutes(1170)).toBe('19:30');
  });
});
