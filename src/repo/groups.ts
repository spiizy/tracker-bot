import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { groups, type Group } from '../db/schema.js';

export async function createGroup(userId: number, name: string): Promise<Group> {
  const [row] = await db.insert(groups).values({ userId, name }).returning();
  return row!;
}

export async function listGroups(userId: number): Promise<Group[]> {
  return db.select().from(groups).where(eq(groups.userId, userId)).orderBy(groups.createdAt);
}

export async function deleteGroup(userId: number, groupId: number): Promise<void> {
  await db.delete(groups).where(and(eq(groups.id, groupId), eq(groups.userId, userId)));
}

export async function getGroup(userId: number, groupId: number): Promise<Group | undefined> {
  return db.query.groups.findFirst({
    where: and(eq(groups.id, groupId), eq(groups.userId, userId)),
  });
}
