import { toFriendly } from '../ton/address.js';

/** Идентификаторы поддерживаемых обозревателей. */
export type ExplorerId = 'tonviewer' | 'tonscan_org' | 'tonscan_com' | 'tonx';
export const DEFAULT_EXPLORER: ExplorerId = 'tonviewer';

interface Explorer {
  id: ExplorerId;
  name: string;
  tx: (hash: string) => string;
  wallet: (friendly: string) => string;
}

// Набор обозревателей. friendly-адрес уже нормализован вызывающим кодом.
const EXPLORERS: Record<ExplorerId, Explorer> = {
  tonviewer: {
    id: 'tonviewer',
    name: 'Tonviewer',
    tx: (h) => `https://tonviewer.com/transaction/${h}`,
    wallet: (a) => `https://tonviewer.com/${a}`,
  },
  tonscan_org: {
    id: 'tonscan_org',
    name: 'Tonscan.org',
    tx: (h) => `https://tonscan.org/tx/${h}`,
    wallet: (a) => `https://tonscan.org/address/${a}`,
  },
  tonscan_com: {
    id: 'tonscan_com',
    name: 'Tonscan.com',
    tx: (h) => `https://tonscan.com/tx/${h}`,
    wallet: (a) => `https://tonscan.com/address/${a}`,
  },
  tonx: {
    id: 'tonx',
    name: 'TON.cx',
    tx: (h) => `https://ton.cx/tx/${h}`,
    wallet: (a) => `https://ton.cx/address/${a}`,
  },
};

export const ALL_EXPLORERS: Explorer[] = Object.values(EXPLORERS);

export function asExplorer(v: unknown): ExplorerId {
  return typeof v === 'string' && v in EXPLORERS ? (v as ExplorerId) : DEFAULT_EXPLORER;
}

export function explorerName(id: ExplorerId): string {
  return EXPLORERS[asExplorer(id)].name;
}

export function txLink(id: ExplorerId, txHash: string): string {
  return EXPLORERS[asExplorer(id)].tx(txHash);
}

export function walletLink(id: ExplorerId, addressRaw: string): string {
  return EXPLORERS[asExplorer(id)].wallet(toFriendly(addressRaw));
}
