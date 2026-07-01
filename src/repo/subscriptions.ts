import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { subscriptionGroups, subscriptions, wallets, users, type Subscription } from '../db/schema.js';
import type { EventType } from '../ton/types.js';

export interface SubscriptionWithWallet {
  id: number;
  walletId: number;
  address: string;
  label: string | null;
  groupId: number | null;
  groupIds: number[];
  filters: EventType[] | null;
}

export interface Subscriber {
  userId: number;
  label: string | null;
  filters: EventType[] | null;
  lang: string;
  explorer: string;
  settings: unknown;
}

/** Возвращает существующую подписку или null, если был дубликат. */
export async function addSubscription(
  userId: number,
  walletId: number,
  label?: string,
): Promise<{ created: boolean; subscription: Subscription }> {
  const [row] = await db
    .insert(subscriptions)
    .values({ userId, walletId, label: label ?? null })
    .onConflictDoNothing({ target: [subscriptions.userId, subscriptions.walletId] })
    .returning();

  if (row) return { created: true, subscription: row };

  const existing = (await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, userId), eq(subscriptions.walletId, walletId)),
  }))!;
  return { created: false, subscription: existing };
}

export async function removeSubscription(userId: number, walletId: number): Promise<boolean> {
  const rows = await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.walletId, walletId)))
    .returning({ id: subscriptions.id });
  return rows.length > 0;
}

export async function listUserSubscriptions(userId: number): Promise<SubscriptionWithWallet[]> {
  const rows = await db
    .select({
      id: subscriptions.id,
      walletId: subscriptions.walletId,
      address: wallets.address,
      label: subscriptions.label,
      groupId: subscriptions.groupId,
      filters: subscriptions.filters,
    })
    .from(subscriptions)
    .innerJoin(wallets, eq(wallets.id, subscriptions.walletId))
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.createdAt);

  if (rows.length === 0) return [];

  const bySub = new Map<number, Set<number>>();
  for (const row of rows) {
    bySub.set(row.id, new Set(row.groupId == null ? [] : [row.groupId]));
  }

  const memberships = await db
    .select({
      subscriptionId: subscriptionGroups.subscriptionId,
      groupId: subscriptionGroups.groupId,
    })
    .from(subscriptionGroups)
    .where(inArray(subscriptionGroups.subscriptionId, rows.map((r) => r.id)));

  for (const m of memberships) bySub.get(m.subscriptionId)?.add(m.groupId);

  return rows.map((row) => ({
    ...row,
    groupIds: [...(bySub.get(row.id) ?? new Set<number>())],
  }));
}

/** Все подписчики кошелька — для веерной рассылки уведомления. */
export async function getSubscribers(walletId: number): Promise<Subscriber[]> {
  return db
    .select({
      userId: subscriptions.userId,
      label: subscriptions.label,
      filters: subscriptions.filters,
      lang: users.lang,
      explorer: users.explorer,
      settings: users.settings,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.telegramId, subscriptions.userId))
    .where(eq(subscriptions.walletId, walletId));
}

export async function updateLabel(
  userId: number,
  walletId: number,
  label: string | null,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ label })
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.walletId, walletId)));
}

export async function updateFilters(
  userId: number,
  walletId: number,
  filters: EventType[] | null,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ filters })
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.walletId, walletId)));
}

export async function assignGroup(
  userId: number,
  walletId: number,
  groupId: number | null,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ groupId })
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.walletId, walletId)));
}

async function findSubscriptionId(userId: number, walletId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.walletId, walletId)))
    .limit(1);
  return row?.id ?? null;
}

export async function addToGroup(userId: number, walletId: number, groupId: number): Promise<void> {
  const subscriptionId = await findSubscriptionId(userId, walletId);
  if (subscriptionId === null) return;
  await db
    .insert(subscriptionGroups)
    .values({ subscriptionId, groupId })
    .onConflictDoNothing();
}

export async function removeFromGroup(userId: number, walletId: number, groupId: number): Promise<void> {
  const subscriptionId = await findSubscriptionId(userId, walletId);
  if (subscriptionId === null) return;
  await db
    .delete(subscriptionGroups)
    .where(and(eq(subscriptionGroups.subscriptionId, subscriptionId), eq(subscriptionGroups.groupId, groupId)));
}

export async function clearGroups(userId: number, walletId: number): Promise<void> {
  const subscriptionId = await findSubscriptionId(userId, walletId);
  if (subscriptionId === null) return;
  await db.delete(subscriptionGroups).where(eq(subscriptionGroups.subscriptionId, subscriptionId));
  await assignGroup(userId, walletId, null);
}

/** Сколько пользователей отслеживают данный адрес (raw). */
export async function countTrackers(addressRaw: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscriptions)
    .innerJoin(wallets, eq(wallets.id, subscriptions.walletId))
    .where(eq(wallets.address, addressRaw));
  return row?.c ?? 0;
}

export async function countSubscriptions(userId?: number): Promise<number> {
  const q = db.select({ c: sql<number>`count(*)::int` }).from(subscriptions);
  const [row] = userId ? await q.where(eq(subscriptions.userId, userId)) : await q;
  return row?.c ?? 0;
}
