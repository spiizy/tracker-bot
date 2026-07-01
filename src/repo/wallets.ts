import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wallets, subscriptions, type Wallet } from '../db/schema.js';

export async function getOrCreateWallet(addressRaw: string): Promise<Wallet> {
  const existing = await db.query.wallets.findFirst({ where: eq(wallets.address, addressRaw) });
  if (existing) return existing;
  const [row] = await db
    .insert(wallets)
    .values({ address: addressRaw })
    .onConflictDoUpdate({ target: wallets.address, set: { updatedAt: new Date() } })
    .returning();
  return row!;
}

export async function getWalletById(id: number): Promise<Wallet | undefined> {
  return db.query.wallets.findFirst({ where: eq(wallets.id, id) });
}

export async function getWalletByAddress(addressRaw: string): Promise<Wallet | undefined> {
  return db.query.wallets.findFirst({ where: eq(wallets.address, addressRaw) });
}

/** Курсор дедупликации (последний обработанный lt). */
export async function updateCursor(id: number, lt: bigint, eventId: string): Promise<void> {
  await db
    .update(wallets)
    .set({ lastLt: lt, lastEventId: eventId, lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(wallets.id, id));
}

/** Отмечает успешную проверку кошелька без движения курсора. */
export async function markChecked(id: number): Promise<void> {
  await db.update(wallets).set({ lastCheckedAt: new Date() }).where(eq(wallets.id, id));
}

/** Все адреса, у которых есть хотя бы одна подписка — набор для SSE. */
export async function getWatchedAddresses(): Promise<
  { id: number; address: string; lastLt: bigint; lastEventId: string | null }[]
> {
  return db
    .selectDistinct({
      id: wallets.id,
      address: wallets.address,
      lastLt: wallets.lastLt,
      lastEventId: wallets.lastEventId,
    })
    .from(wallets)
    .innerJoin(subscriptions, eq(subscriptions.walletId, wallets.id));
}

/** Удаляет кошельки, на которые больше никто не подписан. */
export async function pruneOrphanWallets(): Promise<void> {
  await db.execute(sql`
    DELETE FROM ${wallets}
    WHERE NOT EXISTS (
      SELECT 1 FROM ${subscriptions} s WHERE s.wallet_id = ${wallets.id}
    )
  `);
}

export async function countWallets(): Promise<number> {
  const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(wallets);
  return row?.c ?? 0;
}
