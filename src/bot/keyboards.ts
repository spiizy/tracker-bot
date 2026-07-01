import { InlineKeyboard } from 'grammy';
import type { SubscriptionWithWallet } from '../repo/subscriptions.js';
import type { Group } from '../db/schema.js';
import { ALL_EVENT_TYPES, type EventType } from '../ton/types.js';
import { shortAddress } from '../ton/address.js';
import { type Lang, tr, typeName } from './i18n.js';
import { ALL_EXPLORERS, type ExplorerId } from '../services/explorer.js';
import { type UserSettings, type SortMode } from './settings.js';

const PAGE_SIZE = 8;

/** Отображаемое имя кошелька: метка либо короткий адрес. */
const titleOf = (s: SubscriptionWithWallet): string => s.label?.trim() || shortAddress(s.address);

/** Сортировка по алфавиту (А-Я, без учёта регистра, с числами по значению). */
function sortByTitle(subs: SubscriptionWithWallet[]): SubscriptionWithWallet[] {
  return [...subs].sort((a, b) =>
    titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base', numeric: true }),
  );
}

/**
 * Порядок списка:
 *  - 'alpha' — по имени (А-Я);
 *  - 'date'  — по дате, новые сверху (реверс порядка БД);
 *  - 'none'  — как добавлены (порядок БД = createdAt по возрастанию).
 */
function orderSubs(subs: SubscriptionWithWallet[], sort: SortMode): SubscriptionWithWallet[] {
  if (sort === 'alpha') return sortByTitle(subs);
  if (sort === 'date') return [...subs].reverse();
  return subs;
}

export function mainMenu(lang: Lang, isAdmin: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(tr(lang, 'menu.wallets'), 'wallets')
    .text(tr(lang, 'menu.add'), 'addw')
    .row()
    .text(tr(lang, 'menu.groups'), 'groups')
    .text(tr(lang, 'menu.stats'), 'stats')
    .row()
    .text(tr(lang, 'menu.settings'), 'settings')
    .text(tr(lang, 'menu.help'), 'help')
    .row()
    .text(tr(lang, 'menu.unique'), 'unique');
  if (isAdmin) kb.row().text(tr(lang, 'menu.admin'), 'adm');
  return kb;
}

export function backTo(target: string, label: string): InlineKeyboard {
  return new InlineKeyboard().text(label, target);
}

export function walletsList(
  subs: SubscriptionWithWallet[],
  page: number,
  lang: Lang,
  sort: SortMode = 'alpha',
): { kb: InlineKeyboard; totalPages: number } {
  const sorted = orderSubs(subs, sort);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const p = Math.min(page, totalPages - 1);
  const slice = sorted.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const kb = new InlineKeyboard();
  for (const s of slice) {
    kb.text(`👛 ${titleOf(s)}`, `wallet:${s.walletId}`).row();
  }
  if (totalPages > 1) {
    if (p > 0) kb.text('⬅️', `wallets:p:${p - 1}`);
    kb.text(`${p + 1}/${totalPages}`, 'noop');
    if (p < totalPages - 1) kb.text('➡️', `wallets:p:${p + 1}`);
    kb.row();
  }
  // переключатель сортировки (текущая помечена ✅)
  kb.text(`${sort === 'alpha' ? '✅ ' : ''}${tr(lang, 'sort.alpha')}`, 'sort:alpha')
    .text(`${sort === 'date' ? '✅ ' : ''}${tr(lang, 'sort.byDate')}`, 'sort:date')
    .text(`${sort === 'none' ? '✅ ' : ''}${tr(lang, 'sort.none')}`, 'sort:none')
    .row();
  kb.text(tr(lang, 'menu.add'), 'addw').text(tr(lang, 'wallets.delete'), 'delmode');
  kb.row().text(tr(lang, 'common.menu'), 'menu');
  return { kb, totalPages };
}

/** Список в режиме мультиудаления: тап по кошельку помечает его ✖️. */
export function walletsDeleteList(
  subs: SubscriptionWithWallet[],
  selected: Set<number>,
  page: number,
  lang: Lang,
  sort: SortMode = 'alpha',
): InlineKeyboard {
  const sorted = orderSubs(subs, sort);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const p = Math.min(page, totalPages - 1);
  const slice = sorted.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const kb = new InlineKeyboard();
  for (const s of slice) {
    // выбранный — крестик, невыбранный — просто имя (без квадратика)
    const mark = selected.has(s.walletId) ? '✖️ ' : '';
    kb.text(`${mark}${titleOf(s)}`, `delsel:${s.walletId}:${p}`).row();
  }
  if (totalPages > 1) {
    if (p > 0) kb.text('⬅️', `delpage:${p - 1}`);
    kb.text(`${p + 1}/${totalPages}`, 'noop');
    if (p < totalPages - 1) kb.text('➡️', `delpage:${p + 1}`);
    kb.row();
  }
  kb.text(tr(lang, 'del.confirm', selected.size), 'delconfirm')
    .text(tr(lang, 'del.cancel'), 'wallets');
  return kb;
}

export function walletDetail(walletId: number, lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tr(lang, 'wallet.label'), `label:${walletId}`)
    .text(tr(lang, 'wallet.filters'), `filters:${walletId}`)
    .row()
    .text(tr(lang, 'wallet.group'), `grpset:${walletId}`)
    .text(tr(lang, 'wallet.deleteOne'), `delw:${walletId}`)
    .row()
    .text(tr(lang, 'common.toList'), 'wallets');
}

export function groupPicker(
  walletId: number,
  groups: Group[],
  currentGroupId: number | null,
  lang: Lang,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(`${currentGroupId == null ? '✅ ' : ''}${tr(lang, 'groups.none')}`, `grpassign:${walletId}:0`).row();
  for (const g of groups) {
    kb.text(`${g.id === currentGroupId ? '✅ ' : ''}🗂 ${g.name}`, `grpassign:${walletId}:${g.id}`).row();
  }
  if (groups.length === 0) kb.text(tr(lang, 'groups.create'), 'grpnew').row();
  kb.text(tr(lang, 'common.back'), `wallet:${walletId}`);
  return kb;
}

export function confirmDelete(walletId: number, lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tr(lang, 'wallet.deleteOne'), `delw_yes:${walletId}`)
    .text(tr(lang, 'common.cancel'), `wallet:${walletId}`);
}

export function filtersKeyboard(walletId: number, active: EventType[] | null, lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  const isOn = (t: EventType) => active === null || active.includes(t);
  ALL_EVENT_TYPES.forEach((t, i) => {
    kb.text(`${isOn(t) ? '✅' : '⬜️'} ${typeName(lang, t)}`, `flt:${walletId}:${t}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row().text(tr(lang, 'filters.enableAll'), `fltall:${walletId}`);
  kb.row().text(tr(lang, 'common.back'), `wallet:${walletId}`);
  return kb;
}

export function groupsKeyboard(groups: Group[], lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const g of groups) {
    kb.text(`🗂 ${g.name}`, 'noop').text('🗑', `grpdel:${g.id}`).row();
  }
  kb.text(tr(lang, 'groups.create'), 'grpnew').row().text(tr(lang, 'common.menu'), 'menu');
  return kb;
}

/** Хаб настроек: язык, обозреватель, уведомления, импорт/экспорт. */
export function settingsKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tr(lang, 'settings.lang'), 'set:lang')
    .text(tr(lang, 'settings.explorer'), 'set:explorer')
    .row()
    .text(tr(lang, 'settings.notifs'), 'set:notifs')
    .row()
    .text(tr(lang, 'settings.io'), 'set:io')
    .row()
    .text(tr(lang, 'common.menu'), 'menu');
}

const onOff = (v: boolean) => (v ? '✅' : '❌');

/** Экран настроек уведомлений: тумблеры + переходы в подэкраны. */
export function notifsKeyboard(s: UserSettings, lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(`${onOff(s.silent)} ${tr(lang, 'set.silent')}`, 'nset:silent')
    .text(`${onOff(s.showContract)} ${tr(lang, 'set.contract')}`, 'nset:showContract')
    .row()
    .text(`${onOff(s.showBalances)} ${tr(lang, 'set.balances')}`, 'nset:showBalances')
    .text(`${onOff(s.showUsd)} ${tr(lang, 'set.usd')}`, 'nset:showUsd')
    .row()
    .text(`${onOff(s.dtrade)} ${tr(lang, 'set.dtradeBtn')}`, 'nset:dtrade')
    .text(`${onOff(s.redotrade)} ${tr(lang, 'set.redotradeBtn')}`, 'nset:redotrade')
    .row()
    .text(tr(lang, 'set.amount'), 'set:amount')
    .text(tr(lang, 'set.footer'), 'set:footer')
    .row()
    .text(tr(lang, 'common.back'), 'settings');
  return kb;
}

export function amountKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tr(lang, 'amount.setMin'), 'amt:min')
    .text(tr(lang, 'amount.setMax'), 'amt:max')
    .row()
    .text(tr(lang, 'amount.clear'), 'amt:clear')
    .row()
    .text(tr(lang, 'common.back'), 'set:notifs');
}

/** Подраздел импорта/экспорта. */
export function ioKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tr(lang, 'io.exportJson'), 'export:json')
    .text(tr(lang, 'io.exportCsv'), 'export:csv')
    .text(tr(lang, 'io.exportTxt'), 'export:txt')
    .row()
    .text(tr(lang, 'io.import'), 'import')
    .row()
    .text(tr(lang, 'common.back'), 'settings');
}

export function langKeyboard(current: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${current === 'ru' ? '✅ ' : ''}${tr(current, 'lang.ru')}`, 'lang:ru')
    .text(`${current === 'en' ? '✅ ' : ''}${tr(current, 'lang.en')}`, 'lang:en')
    .row()
    .text(tr(current, 'common.back'), 'settings');
}

export function explorerKeyboard(current: ExplorerId, lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  ALL_EXPLORERS.forEach((e, i) => {
    kb.text(`${e.id === current ? '✅ ' : ''}${e.name}`, `expl:${e.id}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row().text(tr(lang, 'common.back'), 'settings');
  return kb;
}
