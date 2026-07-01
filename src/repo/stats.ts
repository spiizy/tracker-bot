import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { stats } from '../db/schema.js';

export async function increment(key: string, by = 1): Promise<void> {
  await db
    .insert(stats)
    .values({ key, value: by })
    .onConflictDoUpdate({ target: stats.key, set: { value: sql`${stats.value} + ${by}` } });
}

export async function getStat(key: string): Promise<number> {
  const row = await db.query.stats.findFirst({ where: sql`${stats.key} = ${key}` });
  return row?.value ?? 0;
}
