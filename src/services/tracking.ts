import { normalizeAddress } from '../ton/address.js';
import * as walletRepo from '../repo/wallets.js';
import * as subRepo from '../repo/subscriptions.js';
import type { Watcher } from './watcher.js';

export type AddResult =
  | { ok: true; duplicate: boolean; walletId: number; addressRaw: string }
  | { ok: false; reason: 'invalid' };

/** Добавляет кошелёк в отслеживание для пользователя. */
export async function addWallet(
  watcher: Watcher,
  userId: number,
  input: string,
  label?: string,
  refresh = true,
): Promise<AddResult> {
  const addressRaw = normalizeAddress(input);
  if (!addressRaw) return { ok: false, reason: 'invalid' };

  const wallet = await walletRepo.getOrCreateWallet(addressRaw);
  // первый раз — ставим курсор на вершину, чтобы не слать историю
  await watcher.initCursorIfNew(wallet.id, addressRaw, wallet.lastLt);

  const { created } = await subRepo.addSubscription(userId, wallet.id, label);
  if (created && refresh) await watcher.refresh();
  // если кошелёк уже был, но передали метку — обновим её
  else if (label) await subRepo.updateLabel(userId, wallet.id, label);

  return { ok: true, duplicate: !created, walletId: wallet.id, addressRaw };
}

/** Удаляет кошелёк из отслеживания пользователя. */
export async function removeWallet(
  watcher: Watcher,
  userId: number,
  walletId: number,
): Promise<boolean> {
  const removed = await subRepo.removeSubscription(userId, walletId);
  if (removed) {
    await walletRepo.pruneOrphanWallets();
    await watcher.refresh();
  }
  return removed;
}
