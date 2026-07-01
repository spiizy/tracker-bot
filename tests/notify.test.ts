import { describe, it, expect } from 'vitest';
import { dtradeLink, redotradeLink, renderNotification } from '../src/services/notify.js';
import type { WalletEvent } from '../src/ton/types.js';

const CONTRACT = 'EQAbCdEf1234567890';

describe('dtradeLink', () => {
  it('builds the exact format from the spec', () => {
    expect(dtradeLink(CONTRACT)).toBe(`https://t.me/dtrade?start=rifle_${CONTRACT}`);
  });
});

describe('redotradeLink', () => {
  it('builds redotrade link with ref-prefix + friendly address', () => {
    expect(redotradeLink('EQAdOhlFV7WDVS_yOUu3VekjHuytblSbcOwJYHjq8P7q3pTk')).toBe(
      'https://t.me/redotrade?start=rE2jNeaD-EQAdOhlFV7WDVS_yOUu3VekjHuytblSbcOwJYHjq8P7q3pTk',
    );
  });
});

describe('renderNotification', () => {
  const baseEvent: WalletEvent = {
    walletRaw: '0:1111111111111111111111111111111111111111111111111111111111111111',
    eventId: 'hash123',
    lt: 1n,
    txHash: 'hash123',
    timestamp: Math.floor(Date.now() / 1000),
    type: 'buy',
    token: { symbol: 'SCALE', decimals: 9, address: '0:3333333333333333333333333333333333333333333333333333333333333333' },
    amount: '100',
    tonValue: '5',
    description: 'buy',
  };

  it('includes Dtrade and Explorer buttons when token has a contract', () => {
    const { keyboard } = renderNotification(baseEvent, 'My wallet', 1200, { lang: 'ru', explorer: 'tonviewer' });
    const urls = keyboard.inline_keyboard.flat().filter((b) => 'url' in b);
    expect(urls.some((b) => (b as { url: string }).url.includes('t.me/dtrade'))).toBe(true);
    expect(urls.some((b) => (b as { url: string }).url.includes('tonviewer.com'))).toBe(true);
  });

  it('shows the label and TON value in the text', () => {
    const { text } = renderNotification(baseEvent, 'My wallet', 1200);
    expect(text).toContain('My wallet');
    expect(text).toContain('5 TON');
    expect(text).toContain('Покупка');
  });

  it('uses only url buttons and puts Explorer on its own (last) row', () => {
    const { keyboard } = renderNotification(baseEvent, 'My wallet', 1200);
    const callbacks = keyboard.inline_keyboard.flat().filter((b) => 'callback_data' in b);
    expect(callbacks.length).toBe(0); // кнопки "Контракт" больше нет
    const rows = keyboard.inline_keyboard;
    const lastRow = rows[rows.length - 1]!;
    expect(lastRow.some((b) => 'url' in b && (b as { url: string }).url.includes('tonviewer.com'))).toBe(true);
  });

  it('omits Dtrade when there is no token contract', () => {
    const noToken: WalletEvent = { ...baseEvent, token: undefined };
    const { keyboard } = renderNotification(noToken, null, 500);
    const urls = keyboard.inline_keyboard.flat().filter((b) => 'url' in b);
    expect(urls.some((b) => (b as { url: string }).url.includes('t.me/dtrade'))).toBe(false);
  });
});
