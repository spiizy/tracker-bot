import { describe, it, expect } from 'vitest';
import { normalizeSettings, DEFAULT_SETTINGS } from '../src/bot/settings.js';
import { renderNotification } from '../src/services/notify.js';
import type { WalletEvent } from '../src/ton/types.js';

describe('normalizeSettings', () => {
  it('returns defaults for empty input', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('merges valid partial values', () => {
    const s = normalizeSettings({ silent: true, minTon: 5, footer: 'hi', walletFooters: { 12: 'one' }, sort: 'date' });
    expect(s.silent).toBe(true);
    expect(s.minTon).toBe(5);
    expect(s.footer).toBe('hi');
    expect(s.walletFooters).toEqual({ 12: 'one' });
    expect(s.sort).toBe('date');
    expect(s.showContract).toBe(true); // дефолт сохранён
  });
  it('rejects invalid types and falls back', () => {
    const s = normalizeSettings({ minTon: 'oops', chartTf: 'nope', sort: 'weird', footer: '   ' });
    expect(s.minTon).toBeNull();
    expect(s.chartTf).toBe('15m');
    expect(s.sort).toBe('alpha');
    expect(s.footer).toBeNull();
  });
});

const event: WalletEvent = {
  walletRaw: '0:1111111111111111111111111111111111111111111111111111111111111111',
  eventId: 'h',
  lt: 1n,
  txHash: 'h',
  timestamp: Math.floor(Date.now() / 1000),
  type: 'buy',
  token: { symbol: 'SCALE', decimals: 9, address: '0:3333333333333333333333333333333333333333333333333333333333333333' },
  amount: '100',
  tonValue: '5',
  description: 'buy',
};

describe('renderNotification settings', () => {
  it('hides contract line and copy button when showContract=false', () => {
    const { text, keyboard } = renderNotification(event, null, 100, { showContract: false });
    expect(text).not.toContain('Контракт');
    const cbs = keyboard.inline_keyboard.flat().filter((b) => 'callback_data' in b);
    expect(cbs.length).toBe(0);
  });
  it('appends footer text', () => {
    const { text } = renderNotification(event, null, 100, { footer: 'мой текст' });
    expect(text).toContain('<i>мой текст</i>');
  });
  it('toggles trade buttons', () => {
    const { keyboard } = renderNotification(event, null, 100, { dtrade: false, redotrade: true });
    const urls = keyboard.inline_keyboard.flat().filter((b) => 'url' in b) as { url: string }[];
    expect(urls.some((b) => b.url.includes('t.me/dtrade'))).toBe(false);
    expect(urls.some((b) => b.url.includes('redotrade'))).toBe(true);
  });
});
