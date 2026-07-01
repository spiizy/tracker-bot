import { describe, it, expect } from 'vitest';
import { renderNotification } from '../src/services/notify.js';
import { txLink, walletLink, explorerName, asExplorer } from '../src/services/explorer.js';
import { tr } from '../src/bot/i18n.js';
import type { WalletEvent } from '../src/ton/types.js';

const event: WalletEvent = {
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

describe('explorer links', () => {
  it('builds tx links per provider', () => {
    expect(txLink('tonviewer', 'abc')).toBe('https://tonviewer.com/transaction/abc');
    expect(txLink('tonscan_org', 'abc')).toBe('https://tonscan.org/tx/abc');
    expect(txLink('tonscan_com', 'abc')).toBe('https://tonscan.com/tx/abc');
    expect(txLink('tonx', 'abc')).toBe('https://ton.cx/tx/abc');
  });
  it('falls back to default for unknown ids', () => {
    expect(asExplorer('nope')).toBe('tonviewer');
    expect(explorerName('tonscan_org')).toBe('Tonscan.org');
  });
  it('wallet link uses the selected explorer', () => {
    expect(walletLink('tonscan_org', event.walletRaw).startsWith('https://tonscan.org/address/')).toBe(true);
  });
});

describe('i18n', () => {
  it('translates the same key per language', () => {
    expect(tr('ru', 'menu.wallets')).toContain('кошельки');
    expect(tr('en', 'menu.wallets')).toContain('wallets');
  });
});

describe('renderNotification i18n + pending', () => {
  it('renders English labels and the chosen explorer button', () => {
    const { text, keyboard } = renderNotification(event, 'My wallet', 1200, {
      lang: 'en',
      explorer: 'tonscan_org',
    });
    expect(text).toContain('Buy');
    expect(text).toContain('Token');
    const urls = keyboard.inline_keyboard.flat().filter((b) => 'url' in b) as { url: string }[];
    expect(urls.some((b) => b.url.includes('tonscan.org'))).toBe(true);
  });

  it('pending shows the processing marker and hides latency', () => {
    const { text } = renderNotification(event, null, null, { lang: 'ru', pending: true });
    expect(text).toContain('обработке');
    expect(text).not.toContain('Задержка');
  });
});
