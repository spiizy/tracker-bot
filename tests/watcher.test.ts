import { describe, expect, it } from 'vitest';
import { planWalletEvents } from '../src/services/watcher.js';
import type { TonApiEvent } from '../src/ton/types.js';

const WALLET = '0:1111111111111111111111111111111111111111111111111111111111111111';

function event(id: string, lt: number, inProgress = false): TonApiEvent {
  return {
    event_id: id,
    account: { address: WALLET },
    timestamp: 1700000000 + lt,
    actions: [],
    is_scam: false,
    lt,
    in_progress: inProgress,
  };
}

describe('planWalletEvents', () => {
  it('advances cursor over finalized events even when an in-progress event is nearby', () => {
    const plan = planWalletEvents(
      [event('final-13', 13), event('pending-12', 12, true), event('final-11', 11)],
      10n,
      null,
      () => false,
      () => false,
    );

    expect(plan.pending.map((e) => e.event_id)).toEqual(['pending-12']);
    expect(plan.final.map((e) => e.event_id)).toEqual(['final-11', 'final-13']);
    expect(plan.cursorLt).toBe(13n);
    expect(plan.cursorEventId).toBe('final-13');
  });

  it('finalizes tracked pending events even if their lt is already behind the cursor', () => {
    const plan = planWalletEvents(
      [event('pending-12', 12)],
      13n,
      'final-13',
      (raw) => raw.event_id === 'pending-12',
      () => false,
    );

    expect(plan.final.map((e) => e.event_id)).toEqual(['pending-12']);
    expect(plan.cursorLt).toBe(13n);
  });

  it('finalizes tracked pending events by lt even if TonAPI changes event id', () => {
    const plan = planWalletEvents(
      [event('final-12-new-id', 12)],
      13n,
      'final-13',
      (raw) => raw.lt === 12,
      () => false,
    );

    expect(plan.final.map((e) => e.event_id)).toEqual(['final-12-new-id']);
    expect(plan.cursorLt).toBe(13n);
  });

  it('does not re-emit already finalized events', () => {
    const plan = planWalletEvents(
      [event('final-11', 11)],
      10n,
      null,
      () => false,
      (id) => id === 'final-11',
    );

    expect(plan.final).toEqual([]);
    expect(plan.cursorLt).toBe(11n);
  });
});
