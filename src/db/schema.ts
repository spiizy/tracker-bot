import { sql } from 'drizzle-orm';
import {
  pgTable,
  bigint,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  serial,
} from 'drizzle-orm/pg-core';
import type { EventType } from '../ton/types.js';

/**
 * Пользователи бота. telegram_id — естественный PK.
 */
export const users = pgTable('users', {
  telegramId: bigint('telegram_id', { mode: 'number' }).primaryKey(),
  username: text('username'),
  isBlocked: boolean('is_blocked').notNull().default(false),
  // Язык интерфейса ('ru' | 'en') и выбранный блокчейн-обозреватель.
  lang: text('lang').notNull().default('ru'),
  explorer: text('explorer').notNull().default('tonviewer'),
  // Прочие пользовательские настройки (тихий режим, фильтры, формат уведомлений…).
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Глобальный список отслеживаемых адресов. ОДНА строка на уникальный адрес —
 * так выполняется требование "один кошелёк отслеживается один раз глобально".
 * lastLt / lastEventId — курсор для дедупликации и защиты от повторов на рестарте.
 */
export const wallets = pgTable(
  'wallets',
  {
    id: serial('id').primaryKey(),
    address: text('address').notNull(), // raw-форма (0:hex), нормализована
    lastLt: bigint('last_lt', { mode: 'bigint' }).notNull().default(sql`0`),
    lastEventId: text('last_event_id'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    addressUq: uniqueIndex('wallets_address_uq').on(t.address),
  }),
);

/**
 * Группы кошельков пользователя (опциональная организация).
 */
export const groups = pgTable(
  'groups',
  {
    id: serial('id').primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.telegramId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('groups_user_idx').on(t.userId),
  }),
);

/**
 * Подписка пользователя на кошелёк (many-to-many users<->wallets).
 * label / groupId / filters — персональные настройки конкретной подписки.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.telegramId, { onDelete: 'cascade' }),
    walletId: integer('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    label: text('label'),
    groupId: integer('group_id').references(() => groups.id, { onDelete: 'set null' }),
    // null => уведомлять обо всех типах; иначе whitelist типов событий
    filters: jsonb('filters').$type<EventType[] | null>().default(null),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // запрет дубликатов: один и тот же кошелёк нельзя добавить дважды
    userWalletUq: uniqueIndex('subscriptions_user_wallet_uq').on(t.userId, t.walletId),
    walletIdx: index('subscriptions_wallet_idx').on(t.walletId),
    userIdx: index('subscriptions_user_idx').on(t.userId),
  }),
);

/**
 * Счётчик доставленных уведомлений — для статистики (без хранения каждой транзакции).
 */
export const stats = pgTable('stats', {
  key: text('key').primaryKey(),
  value: bigint('value', { mode: 'number' }).notNull().default(0),
});

export type User = typeof users.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
