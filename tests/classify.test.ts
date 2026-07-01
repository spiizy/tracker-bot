import { describe, it, expect } from 'vitest';
import { classifyAction, classifyEvent } from '../src/ton/classify.js';
import type { TonApiAction, TonApiEvent, TonApiJetton } from '../src/ton/types.js';

const WALLET = '0:1111111111111111111111111111111111111111111111111111111111111111';
const OTHER = '0:2222222222222222222222222222222222222222222222222222222222222222';

const jetton = (symbol: string): TonApiJetton => ({
  address: '0:3333333333333333333333333333333333333333333333333333333333333333',
  name: symbol,
  symbol,
  decimals: 9,
});

describe('classifyAction — swaps', () => {
  it('detects BUY (TON -> jetton)', () => {
    const action: TonApiAction = {
      type: 'JettonSwap',
      status: 'ok',
      JettonSwap: {
        amount_in: '0',
        amount_out: '1000000000',
        ton_in: 5_000_000_000,
        user_wallet: { address: WALLET },
        jetton_master_out: jetton('SCALE'),
      },
    };
    const r = classifyAction(action, WALLET);
    expect(r?.type).toBe('buy');
    expect(r?.token?.symbol).toBe('SCALE');
    expect(r?.amount).toBe('1');
    expect(r?.tonValue).toBe('5');
  });

  it('detects SELL (jetton -> TON)', () => {
    const action: TonApiAction = {
      type: 'JettonSwap',
      status: 'ok',
      JettonSwap: {
        amount_in: '2000000000',
        amount_out: '0',
        ton_out: 3_000_000_000,
        user_wallet: { address: WALLET },
        jetton_master_in: jetton('SCALE'),
      },
    };
    const r = classifyAction(action, WALLET);
    expect(r?.type).toBe('sell');
    expect(r?.tonValue).toBe('3');
  });

  it('detects SWAP (jetton -> jetton)', () => {
    const action: TonApiAction = {
      type: 'JettonSwap',
      status: 'ok',
      JettonSwap: {
        amount_in: '1000000000',
        amount_out: '2000000000',
        user_wallet: { address: WALLET },
        jetton_master_in: jetton('A'),
        jetton_master_out: jetton('B'),
      },
    };
    const r = classifyAction(action, WALLET);
    expect(r?.type).toBe('swap');
  });
});

describe('classifyAction — transfers', () => {
  it('TON out when wallet is sender', () => {
    const action: TonApiAction = {
      type: 'TonTransfer',
      status: 'ok',
      TonTransfer: { sender: { address: WALLET }, recipient: { address: OTHER }, amount: 1_000_000_000 },
    };
    expect(classifyAction(action, WALLET)?.type).toBe('transfer_out');
  });

  it('TON in when wallet is recipient', () => {
    const action: TonApiAction = {
      type: 'TonTransfer',
      status: 'ok',
      TonTransfer: { sender: { address: OTHER }, recipient: { address: WALLET }, amount: 1_000_000_000 },
    };
    expect(classifyAction(action, WALLET)?.type).toBe('transfer_in');
  });

  it('jetton transfer out', () => {
    const action: TonApiAction = {
      type: 'JettonTransfer',
      status: 'ok',
      JettonTransfer: {
        sender: { address: WALLET },
        recipient: { address: OTHER },
        amount: '5000000000',
        jetton: jetton('USDT'),
      },
    };
    const r = classifyAction(action, WALLET);
    expect(r?.type).toBe('transfer_out');
    expect(r?.amount).toBe('5');
  });

  it('ignores transfers that do not touch the watched wallet', () => {
    const action: TonApiAction = {
      type: 'TonTransfer',
      status: 'ok',
      TonTransfer: { sender: { address: OTHER }, recipient: { address: OTHER }, amount: 1_000_000_000 },
    };
    expect(classifyAction(action, WALLET)).toBeNull();
  });
});

describe('classifyEvent — picks most significant action', () => {
  it('prefers swap over the accompanying transfer', () => {
    const event: TonApiEvent = {
      event_id: 'abc',
      account: { address: WALLET },
      timestamp: 1700000000,
      is_scam: false,
      lt: 123,
      in_progress: false,
      actions: [
        {
          type: 'TonTransfer',
          status: 'ok',
          TonTransfer: { sender: { address: WALLET }, recipient: { address: OTHER }, amount: 1 },
        },
        {
          type: 'JettonSwap',
          status: 'ok',
          JettonSwap: {
            amount_in: '0',
            amount_out: '1000000000',
            ton_in: 1_000_000_000,
            user_wallet: { address: WALLET },
            jetton_master_out: jetton('X'),
          },
        },
      ],
    };
    const r = classifyEvent(event, WALLET);
    expect(r?.type).toBe('buy');
    expect(r?.lt).toBe(123n);
    expect(r?.eventId).toBe('abc');
  });

  it('falls back to "other" for unknown actions', () => {
    const event: TonApiEvent = {
      event_id: 'xyz',
      account: { address: WALLET },
      timestamp: 1700000000,
      is_scam: false,
      lt: 1,
      in_progress: false,
      actions: [
        { type: 'SmartContractExec', status: 'ok', simple_preview: { description: 'Call foo' } },
      ],
    };
    const r = classifyEvent(event, WALLET);
    expect(r?.type).toBe('other');
    expect(r?.description).toBe('Call foo');
  });
});
