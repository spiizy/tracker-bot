/** Тип события, который видит пользователь. */
export type EventType =
  | 'buy'
  | 'sell'
  | 'swap'
  | 'transfer_in'
  | 'transfer_out'
  | 'mint'
  | 'burn'
  | 'stake'
  | 'unstake'
  | 'liquidity'
  | 'nft_in'
  | 'nft_out'
  | 'other';

export const ALL_EVENT_TYPES: EventType[] = [
  'buy',
  'sell',
  'swap',
  'transfer_in',
  'transfer_out',
  'mint',
  'burn',
  'stake',
  'unstake',
  'liquidity',
  'nft_in',
  'nft_out',
  'other',
];

export interface TokenInfo {
  address?: string; // raw-адрес мастер-контракта джеттона
  name?: string;
  symbol?: string;
  decimals: number;
  image?: string;
}

/** Разобранное событие для одного кошелька, готовое к отправке. */
export interface WalletEvent {
  walletRaw: string; // 0:hex
  eventId: string;
  lt: bigint;
  txHash: string;
  timestamp: number; // unix sec
  type: EventType;
  token?: TokenInfo;
  amount?: string; // человекочитаемое кол-во токена
  tonValue?: string; // эквивалент/объём в TON
  comment?: string;
  description: string; // запасной человекочитаемый текст из TonAPI
}

// ── минимальные типы ответа TonAPI /v2/accounts/{addr}/events ──
// Описываем только используемые поля.

export interface TonApiAccountRef {
  address: string;
  name?: string;
  is_scam?: boolean;
}

export interface TonApiJetton {
  address: string;
  name?: string;
  symbol?: string;
  decimals: number;
  image?: string;
  verification?: string;
}

export interface TonApiAction {
  type: string;
  status: string;
  simple_preview?: {
    name?: string;
    description?: string;
    value?: string;
  };
  TonTransfer?: {
    sender: TonApiAccountRef;
    recipient: TonApiAccountRef;
    amount: number; // nanoton
    comment?: string;
  };
  JettonTransfer?: {
    sender?: TonApiAccountRef;
    recipient?: TonApiAccountRef;
    amount: string; // minimal units
    comment?: string;
    jetton: TonApiJetton;
  };
  JettonSwap?: {
    dex?: string;
    amount_in: string;
    amount_out: string;
    ton_in?: number;
    ton_out?: number;
    user_wallet: TonApiAccountRef;
    jetton_master_in?: TonApiJetton;
    jetton_master_out?: TonApiJetton;
  };
  JettonMint?: {
    recipient: TonApiAccountRef;
    amount: string;
    jetton: TonApiJetton;
  };
  JettonBurn?: {
    sender: TonApiAccountRef;
    amount: string;
    jetton: TonApiJetton;
  };
  NftItemTransfer?: {
    sender?: TonApiAccountRef;
    recipient?: TonApiAccountRef;
    nft: string;
    comment?: string;
  };
  DepositStake?: { amount: number; pool?: TonApiAccountRef };
  WithdrawStake?: { amount: number; pool?: TonApiAccountRef };
  WithdrawStakeRequest?: { amount?: number; pool?: TonApiAccountRef };
}

export interface TonApiEvent {
  event_id: string;
  account: TonApiAccountRef;
  timestamp: number;
  actions: TonApiAction[];
  is_scam: boolean;
  lt: number;
  in_progress: boolean;
}

export interface TonApiEventsResponse {
  events: TonApiEvent[];
  next_from?: number;
}
