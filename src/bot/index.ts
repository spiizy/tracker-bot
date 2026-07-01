import { Bot, GrammyError, session } from 'grammy';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { autoRetry } from '@grammyjs/auto-retry';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { initialSession, type BotContext } from './context.js';
import { registerUserHandlers } from './menu.js';
import { registerAdminHandlers } from './admin.js';
import { setBotCommands } from './commands.js';
import type { Watcher } from '../services/watcher.js';
import * as userRepo from '../repo/users.js';
import { asLang } from './i18n.js';
import { asExplorer } from '../services/explorer.js';
import { normalizeSettings } from './settings.js';

/**
 * Создаёт бота со всем middleware (троттлинг, авто-ретрай, сессии, авторизация),
 * но без доменных обработчиков — их вешаем отдельно, когда уже есть Watcher.
 * Так разрывается цикл bot → notifier → watcher → handlers → bot.
 */
export function buildBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.BOT_TOKEN);

  // Глобальный троттлинг исходящих + авто-ретрай на 429 (FloodWait).
  bot.api.config.use(apiThrottler());
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));

  // In-memory сессии (для диалогов добавления/метки/рассылки).
  bot.use(session({ initial: initialSession }));

  // Аутентификация: апсерт пользователя, кэш настроек, проверка блокировки.
  // Оптимизация скорости: тяжёлые операции (upsert + загрузка настроек) — только при
  // ПЕРВОМ контакте за сессию. Для админа дальше middleware вообще не ходит в БД.
  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return;
    const needPrefs =
      ctx.session.lang === undefined ||
      ctx.session.explorer === undefined ||
      ctx.session.settings === undefined;
    const isAdmin = ctx.from.id === config.ADMIN_ID;

    if (needPrefs) {
      await userRepo.upsertUser(ctx.from.id, ctx.from.username);
      const user = await userRepo.getUser(ctx.from.id);
      ctx.session.lang = asLang(user?.lang);
      ctx.session.explorer = asExplorer(user?.explorer);
      ctx.session.settings = normalizeSettings(user?.settings);
      if (!isAdmin && user?.isBlocked) {
        if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Доступ ограничён' });
        return;
      }
    } else if (!isAdmin) {
      // не-админа продолжаем проверять на блокировку (без апсерта)
      const user = await userRepo.getUser(ctx.from.id);
      if (user?.isBlocked) {
        if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Доступ ограничён' });
        return;
      }
    }
    await next();
  });

  bot.catch((err) => {
    if (
      err.error instanceof GrammyError &&
      err.error.description.includes('message is not modified')
    ) {
      logger.debug('Ignored Telegram message-is-not-modified response');
      return;
    }
    logger.error({ err: String(err.error) }, 'bot middleware error');
  });

  return bot;
}

/** Вешает доменные обработчики. Порядок важен: админский перехват — первым. */
export function attachHandlers(bot: Bot<BotContext>, watcher: Watcher): void {
  registerAdminHandlers(bot, watcher);
  registerUserHandlers(bot, watcher);
}
