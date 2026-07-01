import { Bot, InputFile } from 'grammy';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { BotContext } from './context.js';
import type { Watcher } from '../services/watcher.js';
import * as subRepo from '../repo/subscriptions.js';
import * as groupRepo from '../repo/groups.js';
import * as userRepo from '../repo/users.js';
import * as tracking from '../services/tracking.js';
import { toFriendly, shortAddress, normalizeAddress } from '../ton/address.js';
import { ALL_EVENT_TYPES, type EventType } from '../ton/types.js';
import { type Lang, isLang, tr } from './i18n.js';
import { langOf, explorerOf, t, settingsOf, updateSetting } from './prefs.js';
import { asExplorer, explorerName, walletLink } from '../services/explorer.js';
import { getAccountInfo, getJettonsCount, getTonUsdRate } from '../ton/tonapi.js';
import {
  mainMenu,
  walletsList,
  walletsDeleteList,
  walletDetail,
  confirmDelete,
  filtersKeyboard,
  groupsKeyboard,
  groupWalletsKeyboard,
  groupPicker,
  settingsKeyboard,
  notifsKeyboard,
  amountKeyboard,
  footerWalletsKeyboard,
  footerGroupsKeyboard,
  ioKeyboard,
  langKeyboard,
  explorerKeyboard,
  backTo,
} from './keyboards.js';

const isAdmin = (id?: number) => id === config.ADMIN_ID;

export function registerUserHandlers(bot: Bot<BotContext>, watcher: Watcher): void {
  // ── команды ──────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    ctx.session.awaiting = undefined;
    ctx.session.delSel = undefined;
    await ctx.reply(t(ctx, 'welcome'), {
      reply_markup: mainMenu(langOf(ctx), isAdmin(ctx.from?.id)),
      parse_mode: 'HTML',
    });
  });
  const openMenu = async (ctx: BotContext) => {
    ctx.session.awaiting = undefined;
    ctx.session.delSel = undefined;
    await ctx.reply(t(ctx, 'welcome'), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(langOf(ctx), isAdmin(ctx.from?.id)),
    });
  };
  bot.command('menu', openMenu);
  bot.command('cancel', async (ctx) => {
    ctx.session.awaiting = undefined;
    ctx.session.delSel = undefined;
    await ctx.reply(t(ctx, 'cancel.done'), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(langOf(ctx), isAdmin(ctx.from?.id)),
    });
  });
  bot.command('help', async (ctx) => {
    await ctx.reply(t(ctx, 'help.body'), { parse_mode: 'HTML', reply_markup: backTo('menu', t(ctx, 'common.menu')) });
  });
  bot.command('add', async (ctx) => {
    ctx.session.awaiting = { kind: 'add_wallet' };
    await ctx.reply(t(ctx, 'add.prompt'), { parse_mode: 'HTML', reply_markup: backTo('menu', t(ctx, 'common.cancel')) });
  });
  bot.command('list', async (ctx) => {
    await replyWallets(ctx);
  });
  bot.command('remove', async (ctx) => {
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    if (subs.length === 0) {
      await ctx.reply(t(ctx, 'wallets.empty'));
      return;
    }
    ctx.session.delSel = [];
    await ctx.reply(t(ctx, 'del.title', 0), {
      parse_mode: 'HTML',
      reply_markup: walletsDeleteList(subs, new Set(), 0, langOf(ctx), settingsOf(ctx).sort),
    });
  });
  bot.command('groups', async (ctx) => {
    const groups = await groupRepo.listGroups(ctx.from!.id);
    await ctx.reply(t(ctx, 'groups.title'), { parse_mode: 'HTML', reply_markup: groupsKeyboard(groups, langOf(ctx)) });
  });
  bot.command('stats', async (ctx) => {
    await ctx.reply(await statsText(ctx), { parse_mode: 'HTML', reply_markup: backTo('menu', t(ctx, 'common.menu')) });
  });
  bot.command('settings', async (ctx) => {
    await ctx.reply(t(ctx, 'settings.title'), { parse_mode: 'HTML', reply_markup: settingsKeyboard(langOf(ctx)) });
  });
  bot.command('lang', async (ctx) => {
    await ctx.reply(t(ctx, 'lang.title', langOf(ctx).toUpperCase()), {
      parse_mode: 'HTML',
      reply_markup: langKeyboard(langOf(ctx)),
    });
  });

  // ── навигация ────────────────────────────────────────────
  bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());

  bot.callbackQuery('menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = undefined;
    await ctx.editMessageText(t(ctx, 'welcome'), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(langOf(ctx), isAdmin(ctx.from?.id)),
    });
  });

  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx, 'help.body'), {
      parse_mode: 'HTML',
      reply_markup: backTo('menu', t(ctx, 'common.menu')),
    });
  });

  // ── список кошельков ─────────────────────────────────────
  const showWallets = async (ctx: BotContext, page: number) => {
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    if (subs.length === 0) {
      await ctx.editMessageText(t(ctx, 'wallets.empty'), {
        reply_markup: backTo('addw', t(ctx, 'wallets.addBtn')).row().text(t(ctx, 'common.menu'), 'menu'),
      });
      return;
    }
    const { kb } = walletsList(subs, page, langOf(ctx), settingsOf(ctx).sort);
    await ctx.editMessageText(t(ctx, 'wallets.title', subs.length), { parse_mode: 'HTML', reply_markup: kb });
  };

  bot.callbackQuery('wallets', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.delSel = undefined;
    await showWallets(ctx, 0);
  });
  bot.callbackQuery(/^wallets:p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWallets(ctx, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^sort:(date|alpha|none)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const mode = ctx.match[1] as 'date' | 'alpha' | 'none';
    if (settingsOf(ctx).sort !== mode) await updateSetting(ctx, 'sort', mode);
    await showWallets(ctx, 0);
  });
  bot.callbackQuery('export:message', async (ctx) => {
    await ctx.answerCallbackQuery();
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    await ctx.reply(formatWalletsExportMessage(ctx, subs), { parse_mode: 'HTML' });
  });

  // ── мультиудаление ───────────────────────────────────────
  const showDeleteMode = async (ctx: BotContext, page: number) => {
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    if (subs.length === 0) return showWallets(ctx, 0);
    const sel = new Set(ctx.session.delSel ?? []);
    await ctx.editMessageText(t(ctx, 'del.title', sel.size), {
      parse_mode: 'HTML',
      reply_markup: walletsDeleteList(subs, sel, page, langOf(ctx), settingsOf(ctx).sort),
    });
  };
  bot.callbackQuery('delmode', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.delSel = [];
    await showDeleteMode(ctx, 0);
  });
  bot.callbackQuery(/^delsel:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const walletId = Number(ctx.match[1]);
    const page = Number(ctx.match[2]);
    const sel = new Set(ctx.session.delSel ?? []);
    if (sel.has(walletId)) sel.delete(walletId);
    else sel.add(walletId);
    ctx.session.delSel = [...sel];
    await showDeleteMode(ctx, page);
  });
  bot.callbackQuery(/^delpage:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showDeleteMode(ctx, Number(ctx.match[1]));
  });
  bot.callbackQuery('delconfirm', async (ctx) => {
    const sel = ctx.session.delSel ?? [];
    if (sel.length === 0) {
      return ctx.answerCallbackQuery({ text: t(ctx, 'del.none'), show_alert: true });
    }
    for (const walletId of sel) {
      await tracking.removeWallet(watcher, ctx.from!.id, walletId);
    }
    await ctx.answerCallbackQuery({ text: t(ctx, 'del.done', sel.length) });
    ctx.session.delSel = undefined;
    await showWallets(ctx, 0);
  });

  // ── детали кошелька ──────────────────────────────────────
  const showWalletDetail = async (ctx: BotContext, walletId: number): Promise<boolean> => {
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const sub = subs.find((s) => s.walletId === walletId);
    if (!sub) return false;
    const groups = await groupRepo.listGroups(ctx.from!.id);
    const lang = langOf(ctx);
    const explId = explorerOf(ctx);
    const groupName = groups.filter((g) => sub.groupIds.includes(g.id)).map((g) => g.name).join(', ') || tr(lang, 'wallet.noGroup');
    const filterInfo = sub.filters ? `${sub.filters.length}/${ALL_EVENT_TYPES.length}` : tr(lang, 'wallet.filtersAll');
    const text = tr(lang, 'wallet.card', {
      title: sub.label ? escapeHtml(sub.label) : shortAddress(sub.address),
      friendly: toFriendly(sub.address),
      group: escapeHtml(groupName),
      filters: filterInfo,
      link: walletLink(explId, sub.address),
      explorer: explorerName(explId),
    });
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: walletDetail(walletId, lang),
      link_preview_options: { is_disabled: true },
    });
    return true;
  };

  bot.callbackQuery(/^wallet:(\d+)$/, async (ctx) => {
    const ok = await showWalletDetail(ctx, Number(ctx.match[1]));
    await ctx.answerCallbackQuery(ok ? undefined : { text: t(ctx, 'wallet.notFound'), show_alert: true });
  });

  // ── привязка к группе ────────────────────────────────────
  bot.callbackQuery(/^grpset:(\d+)$/, async (ctx) => {
    const walletId = Number(ctx.match[1]);
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const sub = subs.find((s) => s.walletId === walletId);
    if (!sub) return ctx.answerCallbackQuery({ text: t(ctx, 'wallet.notFound'), show_alert: true });
    await ctx.answerCallbackQuery();
    const groups = await groupRepo.listGroups(ctx.from!.id);
    await ctx.editMessageText(t(ctx, 'groups.pickTitle'), {
      reply_markup: groupPicker(walletId, groups, sub.groupIds, langOf(ctx)),
    });
  });

  bot.callbackQuery(/^grpassign:(\d+):(\d+)$/, async (ctx) => {
    const walletId = Number(ctx.match[1]);
    const rawGroupId = Number(ctx.match[2]);
    if (rawGroupId === 0) {
      await subRepo.clearGroups(ctx.from!.id, walletId);
      await ctx.answerCallbackQuery({ text: t(ctx, 'groups.removed') });
      await showWalletDetail(ctx, walletId);
      return;
    }
    const groupId = rawGroupId;
    if (!(await groupRepo.getGroup(ctx.from!.id, groupId))) {
      return ctx.answerCallbackQuery({ text: t(ctx, 'groups.notFound'), show_alert: true });
    }
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const sub = subs.find((s) => s.walletId === walletId);
    if (!sub) return ctx.answerCallbackQuery({ text: t(ctx, 'wallet.notFound'), show_alert: true });
    const selected = sub.groupIds.includes(groupId);
    if (selected) await subRepo.removeFromGroup(ctx.from!.id, walletId, groupId);
    else await subRepo.addToGroup(ctx.from!.id, walletId, groupId);
    await ctx.answerCallbackQuery({ text: selected ? t(ctx, 'groups.removed') : t(ctx, 'groups.added') });
    await showWalletDetail(ctx, walletId);
  });

  // ── добавление ───────────────────────────────────────────
  bot.callbackQuery('addw', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = { kind: 'add_wallet' };
    await ctx.editMessageText(t(ctx, 'add.prompt'), {
      parse_mode: 'HTML',
      reply_markup: backTo('menu', t(ctx, 'common.cancel')),
    });
  });

  // ── одиночное удаление ───────────────────────────────────
  bot.callbackQuery(/^delw:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const walletId = Number(ctx.match[1]);
    await ctx.editMessageText(t(ctx, 'wallet.deleteOne'), { reply_markup: confirmDelete(walletId, langOf(ctx)) });
  });
  bot.callbackQuery(/^delw_yes:(\d+)$/, async (ctx) => {
    const walletId = Number(ctx.match[1]);
    await tracking.removeWallet(watcher, ctx.from!.id, walletId);
    await ctx.answerCallbackQuery({ text: t(ctx, 'del.done', 1) });
    await showWallets(ctx, 0);
  });

  // ── метка ────────────────────────────────────────────────
  bot.callbackQuery(/^label:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const walletId = Number(ctx.match[1]);
    ctx.session.awaiting = { kind: 'label', walletId };
    await ctx.editMessageText(t(ctx, 'label.prompt'), {
      reply_markup: backTo(`wallet:${walletId}`, t(ctx, 'common.cancel')),
    });
  });

  // ── фильтры ──────────────────────────────────────────────
  const showFilters = async (ctx: BotContext, walletId: number) => {
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const sub = subs.find((s) => s.walletId === walletId);
    if (!sub) return;
    await ctx.editMessageText(t(ctx, 'filters.title'), {
      reply_markup: filtersKeyboard(walletId, sub.filters, langOf(ctx)),
    });
  };
  bot.callbackQuery(/^filters:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFilters(ctx, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^flt:(\d+):(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const walletId = Number(ctx.match[1]);
    const type = ctx.match[2] as EventType;
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const sub = subs.find((s) => s.walletId === walletId);
    if (!sub) return;
    const current = new Set<EventType>(sub.filters ?? ALL_EVENT_TYPES);
    if (current.has(type)) current.delete(type);
    else current.add(type);
    const next =
      current.size === ALL_EVENT_TYPES.length ? null : (ALL_EVENT_TYPES.filter((t) => current.has(t)) as EventType[]);
    await subRepo.updateFilters(ctx.from!.id, walletId, next);
    await showFilters(ctx, walletId);
  });
  bot.callbackQuery(/^fltall:(\d+)$/, async (ctx) => {
    const walletId = Number(ctx.match[1]);
    await subRepo.updateFilters(ctx.from!.id, walletId, null);
    await ctx.answerCallbackQuery({ text: t(ctx, 'filters.allOn') });
    await showFilters(ctx, walletId);
  });

  // ── группы ───────────────────────────────────────────────
  const showGroups = async (ctx: BotContext) => {
    const groups = await groupRepo.listGroups(ctx.from!.id);
    await ctx.editMessageText(t(ctx, 'groups.title'), {
      parse_mode: 'HTML',
      reply_markup: groupsKeyboard(groups, langOf(ctx)),
    });
  };
  const showGroup = async (ctx: BotContext, groupId: number): Promise<boolean> => {
    const group = await groupRepo.getGroup(ctx.from!.id, groupId);
    if (!group) return false;
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const selected = subs.filter((s) => s.groupIds.includes(groupId)).length;
    const text = subs.length === 0
      ? t(ctx, 'groups.walletsEmpty')
      : t(ctx, 'groups.detailTitle', {
          name: escapeHtml(group.name),
          selected,
          total: subs.length,
        });
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: groupWalletsKeyboard(groupId, subs, langOf(ctx)),
    });
    return true;
  };
  bot.callbackQuery('groups', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showGroups(ctx);
  });
  bot.callbackQuery(/^group:(\d+)$/, async (ctx) => {
    const ok = await showGroup(ctx, Number(ctx.match[1]));
    await ctx.answerCallbackQuery(ok ? undefined : { text: t(ctx, 'groups.notFound'), show_alert: true });
  });
  bot.callbackQuery(/^grptoggle:(\d+):(\d+)$/, async (ctx) => {
    const groupId = Number(ctx.match[1]);
    const walletId = Number(ctx.match[2]);
    const group = await groupRepo.getGroup(ctx.from!.id, groupId);
    if (!group) return ctx.answerCallbackQuery({ text: t(ctx, 'groups.notFound'), show_alert: true });
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const sub = subs.find((s) => s.walletId === walletId);
    if (!sub) return ctx.answerCallbackQuery({ text: t(ctx, 'wallet.notFound'), show_alert: true });
    const selected = sub.groupIds.includes(groupId);
    if (selected) await subRepo.removeFromGroup(ctx.from!.id, walletId, groupId);
    else await subRepo.addToGroup(ctx.from!.id, walletId, groupId);
    await ctx.answerCallbackQuery({ text: selected ? t(ctx, 'groups.removed') : t(ctx, 'groups.added') });
    await showGroup(ctx, groupId);
  });
  bot.callbackQuery('grpnew', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = { kind: 'group_create' };
    await ctx.editMessageText(t(ctx, 'groups.newPrompt'), {
      reply_markup: backTo('groups', t(ctx, 'common.cancel')),
    });
  });
  bot.callbackQuery(/^grpdel:(\d+)$/, async (ctx) => {
    await groupRepo.deleteGroup(ctx.from!.id, Number(ctx.match[1]));
    await ctx.answerCallbackQuery({ text: t(ctx, 'groups.deleted') });
    await showGroups(ctx);
  });

  // ── проверка уникальности ────────────────────────────────
  bot.callbackQuery('unique', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = { kind: 'wallet_lookup' };
    await ctx.editMessageText(t(ctx, 'unique.prompt'), {
      reply_markup: backTo('menu', t(ctx, 'common.cancel')),
    });
  });

  // ── статистика ───────────────────────────────────────────
  bot.callbackQuery('stats', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(await statsText(ctx), {
      parse_mode: 'HTML',
      reply_markup: backTo('menu', t(ctx, 'common.menu')),
    });
  });

  // ── настройки (хаб) ──────────────────────────────────────
  const showSettings = async (ctx: BotContext) => {
    await ctx.editMessageText(t(ctx, 'settings.title'), {
      parse_mode: 'HTML',
      reply_markup: settingsKeyboard(langOf(ctx)),
    });
  };
  bot.callbackQuery('settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSettings(ctx);
  });

  // язык
  bot.callbackQuery('set:lang', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx, 'lang.title', langOf(ctx).toUpperCase()), {
      parse_mode: 'HTML',
      reply_markup: langKeyboard(langOf(ctx)),
    });
  });
  bot.callbackQuery(/^lang:(ru|en)$/, async (ctx) => {
    const lang = ctx.match[1] as Lang;
    if (isLang(lang)) {
      ctx.session.lang = lang;
      await userRepo.setLang(ctx.from!.id, lang);
    }
    await ctx.answerCallbackQuery({ text: t(ctx, 'lang.changed') });
    await ctx.editMessageText(t(ctx, 'lang.title', langOf(ctx).toUpperCase()), {
      parse_mode: 'HTML',
      reply_markup: langKeyboard(langOf(ctx)),
    });
  });

  // обозреватель
  bot.callbackQuery('set:explorer', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx, 'explorer.title', explorerName(explorerOf(ctx))), {
      parse_mode: 'HTML',
      reply_markup: explorerKeyboard(explorerOf(ctx), langOf(ctx)),
    });
  });
  bot.callbackQuery(/^expl:(\w+)$/, async (ctx) => {
    const id = asExplorer(ctx.match[1]);
    ctx.session.explorer = id;
    await userRepo.setExplorer(ctx.from!.id, id);
    await ctx.answerCallbackQuery({ text: t(ctx, 'explorer.changed') });
    await ctx.editMessageText(t(ctx, 'explorer.title', explorerName(id)), {
      parse_mode: 'HTML',
      reply_markup: explorerKeyboard(id, langOf(ctx)),
    });
  });

  // ── настройки уведомлений ────────────────────────────────
  const NOTIF_TOGGLES = new Set([
    'silent',
    'showContract',
    'showBalances',
    'showUsd',
    'dtrade',
    'redotrade',
  ]);
  const showNotifs = async (ctx: BotContext) => {
    await ctx.editMessageText(t(ctx, 'notifs.title', activeTradeBots(ctx)), {
      parse_mode: 'HTML',
      reply_markup: notifsKeyboard(settingsOf(ctx), langOf(ctx)),
    });
  };
  bot.callbackQuery('set:notifs', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showNotifs(ctx);
  });
  bot.callbackQuery(/^nset:(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const key = ctx.match[1] ?? '';
    if (!NOTIF_TOGGLES.has(key)) return;
    const k = key as 'silent' | 'showContract' | 'showBalances' | 'showUsd' | 'dtrade' | 'redotrade';
    await updateSetting(ctx, k, !settingsOf(ctx)[k]);
    await showNotifs(ctx);
  });

  // фильтр суммы
  const showAmount = async (ctx: BotContext) => {
    const s = settingsOf(ctx);
    const none = t(ctx, 'amount.none');
    await ctx.editMessageText(
      t(ctx, 'amount.title', { min: s.minTon != null ? String(s.minTon) : none, max: s.maxTon != null ? String(s.maxTon) : none }),
      { parse_mode: 'HTML', reply_markup: amountKeyboard(langOf(ctx)) },
    );
  };
  bot.callbackQuery('set:amount', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAmount(ctx);
  });
  bot.callbackQuery('amt:min', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = { kind: 'min_ton' };
    await ctx.editMessageText(t(ctx, 'amount.promptMin'), { reply_markup: backTo('set:amount', t(ctx, 'common.cancel')) });
  });
  bot.callbackQuery('amt:max', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = { kind: 'max_ton' };
    await ctx.editMessageText(t(ctx, 'amount.promptMax'), { reply_markup: backTo('set:amount', t(ctx, 'common.cancel')) });
  });
  bot.callbackQuery('amt:clear', async (ctx) => {
    await updateSetting(ctx, 'minTon', null);
    await updateSetting(ctx, 'maxTon', null);
    await ctx.answerCallbackQuery({ text: t(ctx, 'misc.cleared') });
    await showAmount(ctx);
  });

  // подпись под уведомлениями
  const showFooterWallets = async (ctx: BotContext, subs?: Awaited<ReturnType<typeof subRepo.listUserSubscriptions>>) => {
    const list = subs ?? await subRepo.listUserSubscriptions(ctx.from!.id);
    await ctx.editMessageText(list.length ? t(ctx, 'footer.chooseWallet') : t(ctx, 'footer.noWallets'), {
      parse_mode: 'HTML',
      reply_markup: footerWalletsKeyboard(list, langOf(ctx)),
    });
  };
  bot.callbackQuery('set:footer', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFooterWallets(ctx);
  });
  bot.callbackQuery('footer:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFooterWallets(ctx);
  });
  bot.callbackQuery('footer:groups', async (ctx) => {
    await ctx.answerCallbackQuery();
    const groups = await groupRepo.listGroups(ctx.from!.id);
    await ctx.editMessageText(groups.length ? t(ctx, 'footer.chooseGroup') : t(ctx, 'footer.noGroups'), {
      parse_mode: 'HTML',
      reply_markup: footerGroupsKeyboard(groups, langOf(ctx)),
    });
  });
  bot.callbackQuery(/^footer:group:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const groupId = Number(ctx.match[1]);
    const subs = (await subRepo.listUserSubscriptions(ctx.from!.id)).filter((s) => s.groupIds.includes(groupId));
    await ctx.editMessageText(subs.length ? t(ctx, 'footer.chooseWallet') : t(ctx, 'footer.noWallets'), {
      parse_mode: 'HTML',
      reply_markup: footerWalletsKeyboard(subs, langOf(ctx), 'footer:groups'),
    });
  });
  bot.callbackQuery(/^footer:wallet:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const walletId = Number(ctx.match[1]);
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const sub = subs.find((s) => s.walletId === walletId);
    if (!sub) {
      await ctx.editMessageText(t(ctx, 'wallet.notFound'), { reply_markup: backTo('set:footer', t(ctx, 'common.back')) });
      return;
    }
    ctx.session.awaiting = { kind: 'footer_wallet', walletId };
    const cur = settingsOf(ctx).walletFooters[String(walletId)];
    await ctx.editMessageText(t(ctx, 'footer.walletTitle', cur ? escapeHtml(cur) : t(ctx, 'footer.empty')), {
      parse_mode: 'HTML',
      reply_markup: backTo('set:footer', t(ctx, 'common.cancel')),
    });
  });

  // импорт/экспорт
  bot.callbackQuery('set:io', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx, 'io.title'), { parse_mode: 'HTML', reply_markup: ioKeyboard(langOf(ctx)) });
  });
  bot.callbackQuery(/^export:(json|csv|txt)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const fmt = ctx.match[1] as 'json' | 'csv' | 'txt';
    const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
    const { content, filename } = exportSubs(subs, fmt);
    await ctx.replyWithDocument(new InputFile(Buffer.from(content, 'utf8'), filename));
  });
  bot.callbackQuery('import', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.awaiting = { kind: 'import' };
    await ctx.editMessageText(t(ctx, 'io.importPrompt'), {
      reply_markup: backTo('set:io', t(ctx, 'common.cancel')),
    });
  });

  // ── импорт файла ─────────────────────────────────────────
  bot.on('message:document', async (ctx) => {
    if (ctx.session.awaiting?.kind !== 'import') return;
    try {
      const file = await ctx.getFile();
      if (!file.file_path) {
        await ctx.reply(t(ctx, 'io.noFile'));
        return;
      }
      const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`;
      const text = await (await fetch(url)).text();
      ctx.session.awaiting = undefined;
      await handleImport(ctx, watcher, text);
    } catch (err) {
      ctx.session.awaiting = undefined;
      logger.error({ err: String(err) }, 'import file failed');
      await ctx.reply(t(ctx, 'io.fileFail'));
    }
  });

  // ── текстовый ввод по состоянию сессии ───────────────────
  bot.on('message:text', async (ctx) => {
    const awaiting = ctx.session.awaiting;
    if (!awaiting) {
      await ctx.reply(t(ctx, 'misc.openMenu'));
      return;
    }
    const text = ctx.message.text.trim();

    switch (awaiting.kind) {
      case 'add_wallet': {
        ctx.session.awaiting = undefined;
        await handleImport(ctx, watcher, text);
        break;
      }
      case 'label': {
        ctx.session.awaiting = undefined;
        const label = text === '-' ? null : text.slice(0, 64);
        await subRepo.updateLabel(ctx.from!.id, awaiting.walletId, label);
        await ctx.reply(t(ctx, 'label.updated'), {
          reply_markup: backTo(`wallet:${awaiting.walletId}`, t(ctx, 'common.toWallet')),
        });
        break;
      }
      case 'group_create': {
        ctx.session.awaiting = undefined;
        await groupRepo.createGroup(ctx.from!.id, text.slice(0, 64));
        await ctx.reply(t(ctx, 'groups.created'), { reply_markup: backTo('groups', t(ctx, 'common.toGroups')) });
        break;
      }
      case 'import': {
        ctx.session.awaiting = undefined;
        await handleImport(ctx, watcher, text);
        break;
      }
      case 'footer': {
        ctx.session.awaiting = undefined;
        const footer = text === '-' ? null : text.slice(0, 200);
        await updateSetting(ctx, 'footer', footer);
        await ctx.reply(t(ctx, 'misc.saved'), { reply_markup: backTo('set:notifs', t(ctx, 'common.back')) });
        break;
      }
      case 'footer_wallet': {
        ctx.session.awaiting = undefined;
        const walletFooters = { ...settingsOf(ctx).walletFooters };
        if (text === '-') delete walletFooters[String(awaiting.walletId)];
        else walletFooters[String(awaiting.walletId)] = text.slice(0, 200);
        await updateSetting(ctx, 'walletFooters', walletFooters);
        await ctx.reply(t(ctx, text === '-' ? 'misc.cleared' : 'misc.saved'), {
          reply_markup: backTo('set:footer', t(ctx, 'common.back')),
        });
        break;
      }
      case 'min_ton':
      case 'max_ton': {
        const kind = awaiting.kind;
        ctx.session.awaiting = undefined;
        const key = kind === 'min_ton' ? 'minTon' : 'maxTon';
        if (text === '-') {
          await updateSetting(ctx, key, null);
          await ctx.reply(t(ctx, 'misc.cleared'), { reply_markup: backTo('set:amount', t(ctx, 'common.back')) });
          break;
        }
        const num = Number(text.replace(',', '.'));
        if (!Number.isFinite(num) || num < 0) {
          await ctx.reply(t(ctx, 'amount.badNumber'), { reply_markup: backTo('set:amount', t(ctx, 'common.back')) });
          break;
        }
        await updateSetting(ctx, key, num);
        await ctx.reply(t(ctx, 'misc.saved'), { reply_markup: backTo('set:amount', t(ctx, 'common.back')) });
        break;
      }
      case 'wallet_lookup': {
        ctx.session.awaiting = undefined;
        const raw = normalizeAddress(text);
        if (!raw) {
          await ctx.reply(t(ctx, 'misc.invalidAddr'), { reply_markup: backTo('menu', t(ctx, 'common.menu')) });
          break;
        }
        try {
          const [info, jettons, trackers, rate] = await Promise.all([
            getAccountInfo(raw),
            getJettonsCount(raw),
            subRepo.countTrackers(raw),
            getTonUsdRate(),
          ]);
          const ton = info.balance / 1e9;
          const explId = explorerOf(ctx);
          await ctx.reply(
            t(ctx, 'lookup.card', {
              friendly: toFriendly(raw),
              ton: ton.toFixed(2),
              usd: rate ? ` (~$${Math.round(ton * rate)})` : '',
              jettons: String(jettons),
              trackers,
              link: walletLink(explId, raw),
              explorer: explorerName(explId),
            }),
            { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: backTo('menu', t(ctx, 'common.menu')) },
          );
        } catch (err) {
          logger.error({ err: String(err) }, 'wallet lookup failed');
          await ctx.reply(t(ctx, 'lookup.fail'), { reply_markup: backTo('menu', t(ctx, 'common.menu')) });
        }
        break;
      }
      // broadcast обрабатывается в admin.ts
      default:
        break;
    }
  });
}

// ── helpers ────────────────────────────────────────────────

async function statsText(ctx: BotContext): Promise<string> {
  const count = await subRepo.countSubscriptions(ctx.from!.id);
  const groups = await groupRepo.listGroups(ctx.from!.id);
  return t(ctx, 'stats.body', { wallets: count, groups: groups.length });
}

/** /list печатает меню, затем сразу список кошельков отдельным сообщением. */
async function replyWallets(ctx: BotContext): Promise<void> {
  const subs = await subRepo.listUserSubscriptions(ctx.from!.id);
  if (subs.length === 0) {
    await ctx.reply(t(ctx, 'wallets.empty'), {
      reply_markup: backTo('addw', t(ctx, 'wallets.addBtn')),
    });
    return;
  }
  const { kb } = walletsList(subs, 0, langOf(ctx), settingsOf(ctx).sort);
  await ctx.reply(t(ctx, 'wallets.title', subs.length), { parse_mode: 'HTML', reply_markup: kb });
}

function activeTradeBots(ctx: BotContext): string {
  const s = settingsOf(ctx);
  const bots = [s.dtrade ? 'DTrade' : null, s.redotrade ? 'RedoTrade' : null].filter(Boolean);
  if (bots.length > 0) return bots.join(', ');
  return langOf(ctx) === 'ru' ? 'нет' : 'none';
}

function formatWalletsExportMessage(
  ctx: BotContext,
  subs: { address: string; label: string | null }[],
): string {
  if (subs.length === 0) return t(ctx, 'wallets.exportEmpty');
  const lines = subs.map((s, i) => {
    const label = s.label?.trim() ? escapeHtml(s.label) : (langOf(ctx) === 'ru' ? 'без метки' : 'no label');
    return `${i + 1}. <code>${toFriendly(s.address)}</code> — ${label}`;
  });
  const title = langOf(ctx) === 'ru' ? '📋 <b>Экспорт кошельков</b>' : '📋 <b>Wallet export</b>';
  return `${title}\n\n${lines.join('\n')}`;
}

interface WalletEntry {
  address: string;
  label?: string;
}

async function handleImport(ctx: BotContext, watcher: Watcher, raw: string): Promise<void> {
  const entries = parseEntries(raw);
  if (entries.length === 0) {
    await ctx.reply(t(ctx, 'add.noAddr'));
    return;
  }
  if (entries.length === 1) {
    const res = await tracking.addWallet(watcher, ctx.from!.id, entries[0]!.address, entries[0]!.label);
    if (!res.ok) {
      await ctx.reply(t(ctx, 'add.invalid'), { reply_markup: backTo('addw', t(ctx, 'wallets.addBtn')) });
      return;
    }
    await ctx.reply(
      res.duplicate
        ? t(ctx, 'add.duplicateCard', { address: shortAddress(res.addressRaw) })
        : t(ctx, 'add.addedCard', {
            address: shortAddress(res.addressRaw),
            interval: config.SWEEP_INTERVAL_SEC,
          }),
      {
        parse_mode: 'HTML',
        reply_markup: backTo('wallets', t(ctx, 'common.toWallets')),
      },
    );
    return;
  }

  let added = 0;
  let dup = 0;
  let invalid = 0;
  for (const e of entries.slice(0, 200)) {
    const res = await tracking.addWallet(watcher, ctx.from!.id, e.address, e.label, false);
    if (!res.ok) invalid++;
    else if (res.duplicate) dup++;
    else added++;
  }
  if (added > 0) await watcher.refresh();
  await ctx.reply(t(ctx, 'add.result', { added, dup, invalid }), {
    reply_markup: backTo('wallets', t(ctx, 'common.toWallets')),
  });
}

/**
 * Разбирает ввод в пары «адрес [метка]». Поддерживает построчный формат,
 * CSV "EQ...,метка" и JSON-массив строк/объектов {address, label}.
 */
function parseEntries(raw: string): WalletEntry[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr
        .map((x: unknown): WalletEntry | null => {
          if (typeof x === 'string') return { address: x };
          const o = x as { address?: string; label?: string };
          return o.address ? { address: o.address, label: o.label || undefined } : null;
        })
        .filter((e): e is WalletEntry => e !== null);
    } catch {
      /* падаем в текстовый разбор ниже */
    }
  }

  const entries: WalletEntry[] = [];
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const sep = line.search(/[\s,]/);
    let address: string;
    let label: string | undefined;
    if (sep === -1) {
      address = line;
    } else {
      address = line.slice(0, sep);
      label = line.slice(sep + 1).replace(/^[\s,]+/, '').trim().replace(/^"|"$/g, '') || undefined;
    }
    if (address.toLowerCase() === 'address') continue; // заголовок CSV
    entries.push({ address, label });
  }
  return entries;
}

function exportSubs(
  subs: { address: string; label: string | null }[],
  fmt: 'json' | 'csv' | 'txt',
): { content: string; filename: string } {
  const rows = subs.map((s) => ({ address: toFriendly(s.address), label: s.label ?? '' }));
  if (fmt === 'json') {
    return { content: JSON.stringify(rows, null, 2), filename: 'wallets.json' };
  }
  if (fmt === 'csv') {
    const lines = ['address,label', ...rows.map((r) => `${r.address},${csvEscape(r.label)}`)];
    return { content: lines.join('\n'), filename: 'wallets.csv' };
  }
  return { content: rows.map((r) => r.address).join('\n'), filename: 'wallets.txt' };
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
