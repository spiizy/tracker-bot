import { describe, it, expect } from 'vitest';
import { formatUnits, formatTon } from '../src/ton/format.js';

describe('formatUnits', () => {
  it('formats jetton amounts with decimals', () => {
    expect(formatUnits('1000000000', 9)).toBe('1');
    expect(formatUnits('1500000000', 9)).toBe('1.5');
    expect(formatUnits('1', 9)).toBe('0.000000'); // 1 нанотокен обрезается до 6 знаков
  });

  it('handles zero decimals', () => {
    expect(formatUnits('42', 0)).toBe('42');
  });

  it('adds thousands separators', () => {
    expect(formatUnits('1234567', 0)).toBe('1 234 567');
  });

  it('caps fractional digits at 6', () => {
    expect(formatUnits('1234567890', 9)).toBe('1.234567');
  });
});

describe('formatTon', () => {
  it('converts nanoton to TON', () => {
    expect(formatTon(2_500_000_000)).toBe('2.5');
    expect(formatTon(1_000_000_000)).toBe('1');
  });
});
