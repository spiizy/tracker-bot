import { sameAddress } from './address.js';
import { formatTon, formatUnits } from './format.js';
import type {
  EventType,
  TokenInfo,
  TonApiAction,
  TonApiEvent,
  TonApiJetton,
  WalletEvent,
} from './types.js';

// Приоритет действий: если в одном событии несколько действий,
// показываем самое значимое (своп важнее простого перевода).
const ACTION_PRIORITY: Record<string, number> = {
  JettonSwap: 100,
  JettonMint: 80,
  JettonBurn: 80,
  DepositStake: 70,
  WithdrawStake: 70,
  WithdrawStakeRequest: 70,
  JettonTransfer: 60,
  NftItemTransfer: 50,
  TonTransfer: 40,
};

function tokenFrom(j?: TonApiJetton): TokenInfo | undefined {
  if (!j) return undefined;
  return {
    address: j.address,
    name: j.name,
    symbol: j.symbol,
    decimals: j.decimals ?? 9,
    image: j.image,
  };
}

/**
 * Классифицирует одно действие относительно кошелька `walletRaw`.
 * Возвращает частичное событие или null, если действие нерелевантно.
 */
export function classifyAction(
  action: TonApiAction,
  walletRaw: string,
): Pick<WalletEvent, 'type' | 'token' | 'amount' | 'tonValue' | 'comment'> | null {
  switch (action.type) {
    case 'JettonSwap': {
      const s = action.JettonSwap;
      if (!s || !sameAddress(s.user_wallet?.address, walletRaw)) return null;
      // TON -> jetton: покупка
      if (s.ton_in && s.ton_in > 0 && s.jetton_master_out) {
        return {
          type: 'buy',
          token: tokenFrom(s.jetton_master_out),
          amount: formatUnits(s.amount_out, s.jetton_master_out.decimals),
          tonValue: formatTon(s.ton_in),
        };
      }
      // jetton -> TON: продажа
      if (s.ton_out && s.ton_out > 0 && s.jetton_master_in) {
        return {
          type: 'sell',
          token: tokenFrom(s.jetton_master_in),
          amount: formatUnits(s.amount_in, s.jetton_master_in.decimals),
          tonValue: formatTon(s.ton_out),
        };
      }
      // jetton -> jetton: своп
      return {
        type: 'swap',
        token: tokenFrom(s.jetton_master_out ?? s.jetton_master_in),
        amount: s.jetton_master_out
          ? formatUnits(s.amount_out, s.jetton_master_out.decimals)
          : undefined,
      };
    }

    case 'JettonTransfer': {
      const t = action.JettonTransfer;
      if (!t?.jetton) return null;
      const out = sameAddress(t.sender?.address, walletRaw);
      const incoming = sameAddress(t.recipient?.address, walletRaw);
      if (!out && !incoming) return null;
      return {
        type: out ? 'transfer_out' : 'transfer_in',
        token: tokenFrom(t.jetton),
        amount: formatUnits(t.amount, t.jetton.decimals),
        comment: t.comment,
      };
    }

    case 'TonTransfer': {
      const t = action.TonTransfer;
      if (!t) return null;
      const out = sameAddress(t.sender?.address, walletRaw);
      const incoming = sameAddress(t.recipient?.address, walletRaw);
      if (!out && !incoming) return null;
      return {
        type: out ? 'transfer_out' : 'transfer_in',
        token: { symbol: 'TON', decimals: 9 },
        amount: formatTon(t.amount),
        tonValue: formatTon(t.amount),
        comment: t.comment,
      };
    }

    case 'NftItemTransfer': {
      const t = action.NftItemTransfer;
      if (!t) return null;
      const out = sameAddress(t.sender?.address, walletRaw);
      const incoming = sameAddress(t.recipient?.address, walletRaw);
      if (!out && !incoming) return null;
      return { type: out ? 'nft_out' : 'nft_in', comment: t.comment };
    }

    case 'JettonMint': {
      const t = action.JettonMint;
      if (!t?.jetton || !sameAddress(t.recipient?.address, walletRaw)) return null;
      return {
        type: 'mint',
        token: tokenFrom(t.jetton),
        amount: formatUnits(t.amount, t.jetton.decimals),
      };
    }

    case 'JettonBurn': {
      const t = action.JettonBurn;
      if (!t?.jetton || !sameAddress(t.sender?.address, walletRaw)) return null;
      return {
        type: 'burn',
        token: tokenFrom(t.jetton),
        amount: formatUnits(t.amount, t.jetton.decimals),
      };
    }

    case 'DepositStake': {
      const amount = action.DepositStake?.amount;
      return amount ? { type: 'stake', tonValue: formatTon(amount) } : null;
    }

    case 'WithdrawStake':
    case 'WithdrawStakeRequest': {
      const amt = action.WithdrawStake?.amount ?? action.WithdrawStakeRequest?.amount;
      return { type: 'unstake', tonValue: amt ? formatTon(amt) : undefined };
    }

    default: {
      // Лучшее усилие для ликвидности — по тексту превью.
      const desc = (action.simple_preview?.name ?? '') + ' ' + (action.simple_preview?.description ?? '');
      if (/liquidity|provide|\bLP\b|pool deposit/i.test(desc)) {
        return { type: 'liquidity' };
      }
      return null;
    }
  }
}

/** Выбирает самое значимое действие события и собирает WalletEvent. */
export function classifyEvent(event: TonApiEvent, walletRaw: string): WalletEvent | null {
  const sorted = [...event.actions].sort(
    (a, b) => (ACTION_PRIORITY[b.type] ?? 0) - (ACTION_PRIORITY[a.type] ?? 0),
  );

  for (const action of sorted) {
    const partial = classifyAction(action, walletRaw);
    if (partial) {
      return {
        walletRaw,
        eventId: event.event_id,
        lt: BigInt(event.lt),
        txHash: event.event_id, // event_id == hash трейса, годится для ссылок
        timestamp: event.timestamp,
        description:
          action.simple_preview?.description ?? action.simple_preview?.name ?? action.type,
        ...partial,
      };
    }
  }

  // Ни одно действие не распознано — отдаём общее событие из первого превью.
  const first = sorted[0];
  if (!first) return null;
  return {
    walletRaw,
    eventId: event.event_id,
    lt: BigInt(event.lt),
    txHash: event.event_id,
    timestamp: event.timestamp,
    type: 'other',
    description: first.simple_preview?.description ?? first.simple_preview?.name ?? first.type,
  };
}
