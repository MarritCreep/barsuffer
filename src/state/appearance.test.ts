import { describe, expect, it } from 'vitest';
import { hexToRgb, isHex, luminance, readableOn, rgbToHex, shiftHue } from './appearance';

describe('appearance colours', () => {
  it('converts between hex and RGB', () => {
    expect(hexToRgb('#8b7cff')).toEqual([139, 124, 255]);
    expect(rgbToHex([139, 124, 255])).toBe('#8b7cff');
    expect(rgbToHex([300, -5, 12.6])).toBe('#ff000d');
  });

  it('validates hex colours', () => {
    expect(isHex('#00ff88')).toBe(true);
    expect(isHex('00ff88')).toBe(false);
    expect(isHex('#fff')).toBe(false);
    expect(isHex(null)).toBe(false);
  });

  it('picks readable button text for any accent', () => {
    expect(readableOn('#ffff00')).toBe('#0f1115'); // жёлтый — тёмный текст
    expect(readableOn('#1a237e')).toBe('#ffffff'); // тёмно-синий — белый текст
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#000000')).toBe(0);
  });

  it('shifts the hue for the fog shades', () => {
    expect(shiftHue('#ff0000', 120)).toBe('#00ff00');
    expect(shiftHue('#ff0000', -120)).toBe('#0000ff');
    expect(shiftHue('#808080', 90)).toBe('#808080'); // серый остаётся серым
  });
});
