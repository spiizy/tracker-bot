import type { Context, SessionFlavor } from 'grammy';
import type { Lang } from './i18n.js';
import type { ExplorerId } from '../services/explorer.js';
import type { UserSettings } from './settings.js';

/** Что бот ждёт от пользователя следующим текстовым сообщением. */
export type Awaiting =
  | { kind: 'add_wallet' }
  | { kind: 'label'; walletId: number }
  | { kind: 'group_create' }
  | { kind: 'import' }
  | { kind: 'broadcast' }
  | { kind: 'admin_find_user' }
  | { kind: 'footer' }
  | { kind: 'min_ton' }
  | { kind: 'max_ton' }
  | { kind: 'wallet_lookup' };

export interface SessionData {
  awaiting?: Awaiting;
  // Кэш настроек пользователя из БД (подтягиваются в middleware).
  lang?: Lang;
  explorer?: ExplorerId;
  settings?: UserSettings;
  // Набор walletId, отмеченных к удалению в режиме мультиудаления.
  delSel?: number[];
}

export type BotContext = Context & SessionFlavor<SessionData>;

export function initialSession(): SessionData {
  return {};
}
