import { Bot } from 'grammy';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { metrics } from '../metrics.js';
import type { BotContext } from './context.js';
import type { Watcher } from '../services/watcher.js';
import * as userRepo from '../repo/users.js';
import * as walletRepo from '../repo/wallets.js';
import * as subRepo from '../repo/subscriptions.js';
import * as statsRepo from '../repo/stats.js';
import { toFriendly } from '../ton/address.js';
import { InlineKeyboard } from 'grammy';

const isAdmin = (id?: number) => id === config.ADMIN_ID;
const PAGE = 10;

function adminMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👥 Пользователи', 'adm:users:0')
    .text('📈 Здоровье', 'adm:health')
    .row()
    .text('📊 Статистика', 'adm:stats')
    .text('📢 Рассылка', 'adm:broadcast')
    .row()
    .text('◀️ Меню', 'menu');
}

export function registerAdminHandlers(bot: Bot<BotContext>, _watcher: Watcher): void {
  // Гард: любые adm:* колбэки — только для админа
  bot.callbackQuery(/^adm/, async (ctx, next) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCallbackQuery({ text: 'Нет доступа', show_alert: true });
      return;
    }
    await next();
  });

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    await ctx.reply('🛠 Админ-панель', { reply_markup: adminMenu() });
  });

  bot.callbackQuery('adm', async (ctx) => {
    await ctx.editMessageText('🛠 <b>Админ-панель</b>', {
      parse_mode: 'HTML',
      reply_markup: adminMenu(),
    });
    await ctx.answerCallbackQuery();
  });

  // ── дашборд статистики ───────────────────────────────────
  bot.callbackQuery('adm:stats', async (ctx) => {
    const [users, blocked, wallets, subs, sent] = await Promise.all([
      userRepo.countUsers(),
      userRepo.countBlocked(),
      walletRepo.countWallets(),
      subRepo.countSubscriptions(),
      statsRepo.getStat('notifications_sent'),
    ]);
    const text =
      '📊 <b>Статистика системы</b>\n\n' +
      `👥 Пользователей: ${users} (заблок.: ${blocked})\n` +
      `👛 Уникальных кошельков: ${wallets}\n` +
      `🔗 Подписок: ${subs}\n` +
      `📨 Отправлено уведомлений: ${sent}`;
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: back() });
    await ctx.answerCallbackQuery();
  });

  // ── здоровье / метрики ───────────────────────────────────
  bot.callbackQuery('adm:health', async (ctx) => {
    const mem = process.memoryUsage();
    const text =
      '📈 <b>Здоровье системы</b>\n\n' +
      `🟢 SSE: ${metrics.sseConnected ? 'подключён' : 'отключён'}\n` +
      `👁 Активных вотчеров: ${metrics.activeWatchers}\n` +
      `⚡ Средняя задержка: ${metrics.avgLatencyMs} мс\n` +
      `🚀 События/мин: ${metrics.tpm}\n` +
      `📨 Отправлено: ${metrics.notificationsSent} (ошибок: ${metrics.notificationsFailed})\n` +
      `🧠 RSS: ${(mem.rss / 1024 / 1024).toFixed(0)} МБ\n` +
      `⏱ Аптайм: ${formatUptime(metrics.uptimeSec)}`;
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: back('adm:health', true) });
    await ctx.answerCallbackQuery();
  });

  // ── пользователи ─────────────────────────────────────────
  bot.callbackQuery(/^adm:users:(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    const total = await userRepo.countUsers();
    const users = await userRepo.listUsers(PAGE, page * PAGE);
    const kb = new InlineKeyboard();
    for (const u of users) {
      const tag = u.username ? `@${u.username}` : `id${u.telegramId}`;
      kb.text(`${u.isBlocked ? '🚫' : '👤'} ${tag}`, `adm:user:${u.telegramId}`).row();
    }
    const pages = Math.max(1, Math.ceil(total / PAGE));
    if (page > 0) kb.text('⬅️', `adm:users:${page - 1}`);
    kb.text(`${page + 1}/${pages}`, 'noop');
    if (page < pages - 1) kb.text('➡️', `adm:users:${page + 1}`);
    kb.row().text('🔎 Найти по юзернейму', 'adm:finduser');
    kb.row().text('◀️ Назад', 'adm');
    await ctx.editMessageText(`👥 <b>Пользователи</b> (${total}):`, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^adm:user:(\d+)$/, async (ctx) => {
    const card = await userCard(Number(ctx.match[1]));
    if (!card) return ctx.answerCallbackQuery({ text: 'Не найден', show_alert: true });
    await ctx.editMessageText(card.text, { parse_mode: 'HTML', reply_markup: card.keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^adm:toggle:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const user = await userRepo.getUser(id);
    if (!user) return ctx.answerCallbackQuery();
    await userRepo.setBlocked(id, !user.isBlocked);
    await ctx.answerCallbackQuery({ text: user.isBlocked ? 'Разблокирован' : 'Заблокирован' });
    const card = await userCard(id);
    if (card) await ctx.editMessageText(card.text, { parse_mode: 'HTML', reply_markup: card.keyboard });
  });

  // Все отслеживаемые кошельки пользователя
  bot.callbackQuery(/^adm:uwallets:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const subs = await subRepo.listUserSubscriptions(id);
    const kb = new InlineKeyboard().text('◀️ К пользователю', `adm:user:${id}`);
    if (subs.length === 0) {
      await ctx.editMessageText('👛 У пользователя нет отслеживаемых кошельков.', { reply_markup: kb });
      return ctx.answerCallbackQuery();
    }
    const lines = subs.slice(0, 50).map((s, i) => {
      const lbl = s.label ? `${escapeHtml(s.label)} — ` : '';
      return `${i + 1}. ${lbl}<code>${toFriendly(s.address)}</code>`;
    });
    const more = subs.length > 50 ? `\n…и ещё ${subs.length - 50}` : '';
    await ctx.editMessageText(
      `👛 <b>Кошельки пользователя</b> (${subs.length}):\n\n${lines.join('\n')}${more}`,
      { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } },
    );
    await ctx.answerCallbackQuery();
  });

  // Поиск пользователя по юзернейму
  bot.callbackQuery('adm:finduser', async (ctx) => {
    ctx.session.awaiting = { kind: 'admin_find_user' };
    await ctx.editMessageText('🔎 Пришлите юзернейм пользователя (с @ или без):', {
      reply_markup: back(),
    });
    await ctx.answerCallbackQuery();
  });

  // ── рассылка ─────────────────────────────────────────────
  bot.callbackQuery('adm:broadcast', async (ctx) => {
    ctx.session.awaiting = { kind: 'broadcast' };
    await ctx.editMessageText('📢 Пришлите текст рассылки (HTML). Отправится всем активным.', {
      reply_markup: back(),
    });
    await ctx.answerCallbackQuery();
  });

  // Перехватываем админский текстовый ввод РАНЬШЕ пользовательского обработчика.
  bot.on('message:text', async (ctx, next) => {
    if (!isAdmin(ctx.from?.id)) return next();
    const kind = ctx.session.awaiting?.kind;

    // поиск пользователя по юзернейму
    if (kind === 'admin_find_user') {
      ctx.session.awaiting = undefined;
      const user = await userRepo.findByUsername(ctx.message.text.trim());
      if (!user) {
        await ctx.reply('Пользователь не найден.', { reply_markup: back() });
        return;
      }
      const card = await userCard(user.telegramId);
      if (card) await ctx.reply(card.text, { parse_mode: 'HTML', reply_markup: card.keyboard });
      return;
    }

    if (kind !== 'broadcast') return next();
    ctx.session.awaiting = undefined;
    const body = ctx.message.text;
    const ids = await userRepo.allUserIds();
    await ctx.reply(`Отправляю ${ids.length} пользователям…`);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await ctx.api.sendMessage(id, body, { parse_mode: 'HTML' });
        ok++;
      } catch (err) {
        fail++;
        logger.debug({ id, err: String(err) }, 'broadcast send failed');
      }
    }
    await ctx.reply(`✅ Доставлено: ${ok}\n⚠️ Ошибок: ${fail}`, { reply_markup: back() });
  });
}

/** Карточка пользователя: текст + клавиатура (используется в нескольких местах). */
async function userCard(
  id: number,
): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const user = await userRepo.getUser(id);
  if (!user) return null;
  const subs = await subRepo.countSubscriptions(id);
  const text =
    `👤 <b>Пользователь</b>\nID: <code>${id}</code>\n` +
    `${user.username ? `Username: @${user.username}\n` : ''}` +
    `Кошельков: ${subs}\nСтатус: ${user.isBlocked ? '🚫 заблокирован' : '🟢 активен'}`;
  const keyboard = new InlineKeyboard()
    .text(user.isBlocked ? '✅ Разблокировать' : '🚫 Заблокировать', `adm:toggle:${id}`)
    .row()
    .text('👛 Кошельки пользователя', `adm:uwallets:${id}`)
    .row()
    .text('◀️ К списку', 'adm:users:0');
  return { text, keyboard };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function back(refresh?: string, withRefresh = false): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (withRefresh && refresh) kb.text('🔄 Обновить', refresh).row();
  return kb.text('◀️ Назад', 'adm');
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}д ${h}ч ${m}м`;
}
