import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, type User } from '../db/schema.js';

export async function upsertUser(telegramId: number, username?: string): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({ telegramId, username })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: { username: username ?? null },
    })
    .returning();
  return row!;
}

export async function getUser(telegramId: number): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
}

/** Поиск по юзернейму (без учёта регистра и ведущего @). */
export async function findByUsername(username: string): Promise<User | undefined> {
  const u = username.replace(/^@/, '');
  return db.query.users.findFirst({ where: sql`lower(${users.username}) = lower(${u})` });
}

export async function setBlocked(telegramId: number, blocked: boolean): Promise<void> {
  await db.update(users).set({ isBlocked: blocked }).where(eq(users.telegramId, telegramId));
}

export async function setLang(telegramId: number, lang: string): Promise<void> {
  await db.update(users).set({ lang }).where(eq(users.telegramId, telegramId));
}

export async function setExplorer(telegramId: number, explorer: string): Promise<void> {
  await db.update(users).set({ explorer }).where(eq(users.telegramId, telegramId));
}

/** Частичный патч настроек (шаллоу-мердж в jsonb). */
export async function patchSettings(
  telegramId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .update(users)
    .set({ settings: sql`${users.settings} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(users.telegramId, telegramId));
}

export async function listUsers(limit: number, offset: number): Promise<User[]> {
  return db.select().from(users).orderBy(users.createdAt).limit(limit).offset(offset);
}

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
  return row?.c ?? 0;
}

export async function countBlocked(): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.isBlocked, true));
  return row?.c ?? 0;
}

/** Все id пользователей — для рассылки. */
export async function allUserIds(): Promise<number[]> {
  const rows = await db
    .select({ id: users.telegramId })
    .from(users)
    .where(eq(users.isBlocked, false));
  return rows.map((r) => r.id);
}
