import type { BotContext } from './context.js';
import { type Lang, DEFAULT_LANG, tr } from './i18n.js';
import { type ExplorerId, DEFAULT_EXPLORER } from '../services/explorer.js';
import { type UserSettings, DEFAULT_SETTINGS } from './settings.js';
import * as userRepo from '../repo/users.js';

/** Язык пользователя из сессии (с дефолтом). */
export const langOf = (ctx: BotContext): Lang => ctx.session.lang ?? DEFAULT_LANG;

/** Выбранный обозреватель из сессии (с дефолтом). */
export const explorerOf = (ctx: BotContext): ExplorerId => ctx.session.explorer ?? DEFAULT_EXPLORER;

/** Настройки пользователя из сессии (с дефолтами). */
export const settingsOf = (ctx: BotContext): UserSettings => ctx.session.settings ?? DEFAULT_SETTINGS;

/** Обновляет настройку: пишет в БД и в кэш сессии. */
export async function updateSetting<K extends keyof UserSettings>(
  ctx: BotContext,
  key: K,
  value: UserSettings[K],
): Promise<void> {
  const next = { ...settingsOf(ctx), [key]: value };
  ctx.session.settings = next;
  await userRepo.patchSettings(ctx.from!.id, { [key]: value });
}

/** Перевод в контексте текущего пользователя. */
export const t = (ctx: BotContext, key: Parameters<typeof tr>[1], arg?: unknown): string =>
  tr(langOf(ctx), key, arg);
