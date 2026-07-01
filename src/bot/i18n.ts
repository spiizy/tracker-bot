import type { EventType } from '../ton/types.js';

/** Поддерживаемые языки интерфейса. */
export type Lang = 'ru' | 'en';
export const LANGS: Lang[] = ['ru', 'en'];
export const DEFAULT_LANG: Lang = 'ru';

export function isLang(v: unknown): v is Lang {
  return v === 'ru' || v === 'en';
}

export function asLang(v: unknown): Lang {
  return isLang(v) ? v : DEFAULT_LANG;
}

// Тип словаря: строка или функция-шаблон с аргументами.
type Entry = string | ((...args: never[]) => string);
type Dict = Record<string, Entry>;

/**
 * Плоский словарь строк. Ключи одинаковы для всех языков.
 * Функции — для строк с подстановками.
 */
const RU = {
  // ── общее ──
  'common.back': '◀️ Назад',
  'common.menu': '◀️ Меню',
  'common.cancel': '❌ Отмена',
  'common.toWallet': '◀️ К кошельку',
  'common.toWallets': '👛 К кошелькам',
  'common.toList': '◀️ К списку',
  'common.toGroups': '◀️ К группам',
  'common.notFound': 'Не найдено',
  'common.noAccess': 'Доступ ограничён',
  'cancel.done': '✅ Действие отменено.\n\nВыберите, что сделать дальше:',

  // ── главное меню ──
  'menu.title': 'Главное меню:',
  'menu.wallets': '👛 Мои кошельки',
  'menu.add': '➕ Добавить кошелёк',
  'menu.groups': '🗂 Группы',
  'menu.stats': '📊 Статистика',
  'menu.settings': '⚙️ Настройки',
  'menu.help': '❓ Помощь',
  'menu.admin': '🛠 Админ-панель',

  // ── приветствие / помощь ──
  'welcome':
    '👋 <b>TON Wallet Tracker</b>\n\n' +
    'Отслеживаю транзакции TON-кошельков и присылаю уведомления с минимальной задержкой ' +
    '(покупки, продажи, свопы, переводы и др.).\n\n' +
    'Выберите действие:',
  'help.title': '❓ <b>Помощь</b>',
  'help.body':
    '❓ <b>Помощь</b>\n\n' +
    '• <b>Мои кошельки</b> — список, метки, фильтры, удаление.\n' +
    '• <b>Добавить</b> — пришлите адрес EQ…/UQ…/raw (можно списком).\n' +
    '• <b>Группы</b> — организация кошельков.\n' +
    '• <b>Фильтры</b> — какие события присылать.\n' +
    '• <b>Настройки</b> — язык, обозреватель, импорт/экспорт.\n\n' +
    'Команды: /add, /list, /remove, /groups, /stats, /settings, /lang, /help.',

  // ── список кошельков ──
  'wallets.title': (n: number) => `👛 <b>Ваши кошельки</b> (${n}):`,
  'wallets.empty': 'У вас пока нет кошельков. Добавьте первый:',
  'wallets.addBtn': '➕ Добавить кошелёк',
  'wallets.delete': '🗑 Удалить',

  // ── режим мультиудаления ──
  'del.title': (n: number) =>
    `🗑 <b>Удаление кошельков</b>\n\nОтметьте кошельки для удаления и нажмите «Подтвердить».\n` +
    `Выбрано: <b>${n}</b>`,
  'del.confirm': (n: number) => `🗑 Удалить (${n})`,
  'del.cancel': '❌ Отмена',
  'del.none': 'Ничего не выбрано',
  'del.done': (n: number) => `Удалено: ${n}`,

  // ── карточка кошелька ──
  'wallet.group': '🗂 Группа',
  'wallet.noGroup': '—',
  'wallet.filters': '🔔 Фильтры',
  'wallet.filtersAll': 'все',
  'wallet.label': '🏷 Метка',
  'wallet.deleteOne': '🗑 Удалить',
  'wallet.openIn': (name: string) => `🔗 Открыть в ${name}`,
  'wallet.card': (p: { title: string; friendly: string; group: string; filters: string; link: string; explorer: string }) =>
    `👛 <b>${p.title}</b>\n` +
    `📄 <code>${p.friendly}</code>\n` +
    `🗂 Группа: ${p.group}\n` +
    `🔔 Фильтры: ${p.filters}\n` +
    `🔗 <a href="${p.link}">Открыть в ${p.explorer}</a>`,
  'wallet.notFound': 'Кошелёк не найден',

  // ── добавление ──
  'add.prompt':
    '➕ Пришлите адрес TON-кошелька (EQ… / UQ… / raw).\n\n' +
    'Можно сразу с меткой через пробел:\n' +
    '<code>EQBom4slLIetxxKbAMYRD61BQwsxRnR_Tm0AO5ejiXsSYuYT Ферма</code>\n\n' +
    'И несколько сразу — каждый с новой строки:\n' +
    '<code>EQBC8...704IR ферма\nUQCR2...CCoHMuO ферма 2</code>',
  'add.noAddr': 'Не нашёл ни одного адреса. Проверьте формат.',
  'add.invalid': '⚠️ Адрес не похож на TON-кошелёк. Проверьте EQ…/UQ… или raw-формат.',
  'add.addedCard': (p: { address: string; interval: number }) =>
    `✅ <b>Кошелёк добавлен в отслеживание</b>\n\n` +
    `👛 Адрес: <code>${p.address}</code>\n` +
    `🔎 Статус: <b>активен</b>\n` +
    `⏱ Проверка: каждые <b>${p.interval}</b> сек + мгновенный TonAPI stream\n\n` +
    `Теперь я пришлю уведомление, когда появится новая транзакция.`,
  'add.duplicateCard': (p: { address: string }) =>
    `♻️ <b>Кошелёк уже отслеживается</b>\n\n` +
    `👛 Адрес: <code>${p.address}</code>\n\n` +
    `Уведомления по новым транзакциям уже включены.`,
  'add.result': (p: { added: number; dup: number; invalid: number }) =>
    `✅ Добавлено: ${p.added}\n♻️ Уже было: ${p.dup}\n⚠️ Невалидных: ${p.invalid}`,

  // ── метка ──
  'label.prompt': '🏷 Пришлите новую метку для кошелька (или «-» чтобы убрать):',
  'label.updated': '🏷 Метка обновлена.',

  // ── группы ──
  'groups.title': '🗂 <b>Ваши группы</b>:',
  'groups.create': '➕ Создать группу',
  'groups.newPrompt': 'Пришлите название новой группы:',
  'groups.created': '🗂 Группа создана.',
  'groups.deleted': 'Группа удалена',
  'groups.pickTitle': '🗂 Выберите группу для кошелька:',
  'groups.none': '🚫 Без группы',
  'groups.added': 'Добавлено в группу',
  'groups.removed': 'Убрано из группы',
  'groups.notFound': 'Группа не найдена',

  // ── фильтры ──
  'filters.title': '🔔 Выберите типы событий для уведомлений:',
  'filters.enableAll': '🔔 Включить все',
  'filters.allOn': 'Все типы включены',

  // ── статистика ──
  'stats.body': (p: { wallets: number; groups: number }) =>
    `📊 <b>Статистика</b>\n\n👛 Кошельков: ${p.wallets}\n🗂 Групп: ${p.groups}`,

  // ── настройки (хаб) ──
  'settings.title': '⚙️ <b>Настройки</b>\n\nВыберите раздел:',
  'settings.lang': '🌐 Язык',
  'settings.explorer': '🧭 Обозреватель',
  'settings.io': '📁 Импорт / Экспорт',

  // ── язык ──
  'lang.title': (current: string) => `🌐 <b>Язык интерфейса</b>\n\nСейчас: <b>${current}</b>`,
  'lang.changed': 'Язык изменён',
  'lang.ru': '🇷🇺 Русский',
  'lang.en': '🇬🇧 English',

  // ── обозреватель ──
  'explorer.title': (current: string) =>
    `🧭 <b>Обозреватель блокчейна</b>\n\nСейчас: <b>${current}</b>\n\n` +
    `Адреса и ссылки в уведомлениях открываются через выбранный обозреватель.`,
  'explorer.changed': 'Обозреватель изменён',

  // ── импорт / экспорт ──
  'io.title': '📁 <b>Импорт / Экспорт</b>\n\nЭкспорт или импорт списка кошельков:',
  'io.exportJson': '📤 Экспорт JSON',
  'io.exportCsv': '📤 CSV',
  'io.exportTxt': '📤 TXT',
  'io.import': '📥 Импорт',
  'io.importPrompt': '📥 Пришлите адреса (текстом, по одному в строке) или файлом .txt/.csv/.json.',
  'io.fileFail': 'Не удалось прочитать файл.',
  'io.noFile': 'Не удалось получить файл.',

  // ── прочее ──
  'misc.openMenu': 'Откройте меню: /menu',
  'misc.copied': 'Скопировано',
  'misc.saved': 'Сохранено',
  'misc.cleared': 'Сброшено',
  'misc.invalidAddr': 'Неверный адрес.',
  'misc.on': 'вкл',
  'misc.off': 'выкл',

  // ── настройки уведомлений ──
  'settings.notifs': '🔔 Уведомления',
  'notifs.title': '🔔 <b>Настройки уведомлений</b>\n\nФормат и фильтры сообщений о транзакциях.',
  'set.silent': '🌨 Тихий режим',
  'set.contract': '⚡ Контракт токена',
  'set.balances': '💼 Балансы',
  'set.usd': '💵 USD в балансах',
  'set.dtradeBtn': '🚀 DTrade',
  'set.redotradeBtn': '♻️ RedoTrade',
  'set.chartTf': '📈 Период графика',
  'set.amount': '🎯 Фильтр суммы',
  'set.footer': '✏️ Подпись',

  // период графика
  'chartTf.title': (tf: string) => `📈 <b>Период графика</b>\n\nСейчас: <b>${tf}</b>`,
  'chartTf.changed': 'Период изменён',

  // фильтр суммы
  'amount.title': (p: { min: string; max: string }) =>
    `🎯 <b>Фильтр суммы (TON)</b>\n\nМин: <b>${p.min}</b>\nМакс: <b>${p.max}</b>\n\n` +
    `События с объёмом вне диапазона не присылаются.`,
  'amount.setMin': '✏️ Мин',
  'amount.setMax': '✏️ Макс',
  'amount.clear': '🗑 Сбросить',
  'amount.promptMin': 'Пришлите минимальную сумму в TON (число), или «-» чтобы убрать:',
  'amount.promptMax': 'Пришлите максимальную сумму в TON (число), или «-» чтобы убрать:',
  'amount.none': 'не задано',
  'amount.badNumber': 'Нужно число. Попробуйте ещё раз из меню фильтра.',

  // подпись под уведомлениями
  'footer.title': (cur: string) =>
    `✏️ <b>Подпись под уведомлениями</b>\n\nСейчас: ${cur}\n\nЭтот текст добавляется внизу каждого уведомления.`,
  'footer.prompt': 'Пришлите текст-подпись (до 200 символов), или «-» чтобы убрать:',
  'footer.empty': '<i>не задана</i>',

  // сортировка списка
  'sort.byDate': '📌 По дате',
  'sort.alpha': '🔤 А-Я',
  'sort.none': '🚫 Выкл',

  // проверка уникальности
  'menu.unique': '📍 Проверить уникальность',
  'unique.prompt': '📍 Пришлите адрес кошелька — покажу, сколько наших пользователей его отслеживают.',
  'unique.result': (n: number) => `📍 Этот кошелёк отслеживают у нас: <b>${n}</b> польз.`,

  // ── типы событий (фильтры, короткие) ──
  'type.buy': 'Покупка',
  'type.sell': 'Продажа',
  'type.swap': 'Своп',
  'type.transfer_in': 'Вход. перевод',
  'type.transfer_out': 'Исх. перевод',
  'type.mint': 'Mint',
  'type.burn': 'Burn',
  'type.stake': 'Стейк',
  'type.unstake': 'Анстейк',
  'type.liquidity': 'Ликвидность',
  'type.nft_in': 'NFT вход',
  'type.nft_out': 'NFT исход',
  'type.other': 'Прочее',

  // ── уведомления: заголовки типов (с эмодзи-цветом) ──
  'note.buy': '🟢 Покупка',
  'note.sell': '🔴 Продажа',
  'note.swap': '🔄 Своп',
  'note.transfer_in': '📥 Входящий перевод',
  'note.transfer_out': '📤 Исходящий перевод',
  'note.mint': '🪙 Mint',
  'note.burn': '🔥 Burn',
  'note.stake': '🏦 Стейкинг',
  'note.unstake': '🏧 Анстейкинг',
  'note.liquidity': '💧 Ликвидность',
  'note.nft_in': '🖼️ NFT получен',
  'note.nft_out': '🖼️ NFT отправлен',
  'note.other': 'ℹ️ Действие',

  // ── уведомления: поля и кнопки ──
  'note.pending': '⏳ <i>В обработке…</i>',
  'note.token': 'Токен',
  'note.contract': 'Контракт',
  'note.volume': 'Объём',
  'note.balance': 'Баланс',
  'note.latency': 'Задержка',
  'note.sec': 'с',
  'note.btnDtrade': '🚀 Dtrade',
  'note.btnContract': '📋 Контракт',

  // ── инфо по кошельку (Глаз Бога) ──
  'lookup.card': (p: { friendly: string; ton: string; usd: string; jettons: string; trackers: number; link: string; explorer: string }) =>
    `🔍 <b>Информация о кошельке</b>\n\n` +
    `📄 <code>${p.friendly}</code>\n` +
    `💎 Баланс: <b>${p.ton} TON</b>${p.usd}\n` +
    `🪙 Джеттонов: ${p.jettons}\n` +
    `📍 Отслеживают у нас: ${p.trackers}\n` +
    `🔗 <a href="${p.link}">Открыть в ${p.explorer}</a>`,
  'lookup.fail': 'Не удалось получить данные кошелька.',
} satisfies Dict;

const EN: Record<keyof typeof RU, Entry> = {
  // ── common ──
  'common.back': '◀️ Back',
  'common.menu': '◀️ Menu',
  'common.cancel': '❌ Cancel',
  'common.toWallet': '◀️ To wallet',
  'common.toWallets': '👛 To wallets',
  'common.toList': '◀️ To list',
  'common.toGroups': '◀️ To groups',
  'common.notFound': 'Not found',
  'common.noAccess': 'Access denied',
  'cancel.done': '✅ Action cancelled.\n\nChoose what to do next:',

  // ── main menu ──
  'menu.title': 'Main menu:',
  'menu.wallets': '👛 My wallets',
  'menu.add': '➕ Add wallet',
  'menu.groups': '🗂 Groups',
  'menu.stats': '📊 Stats',
  'menu.settings': '⚙️ Settings',
  'menu.help': '❓ Help',
  'menu.admin': '🛠 Admin panel',

  // ── welcome / help ──
  'welcome':
    '👋 <b>TON Wallet Tracker</b>\n\n' +
    'I track TON wallet transactions and send notifications with minimal delay ' +
    '(buys, sells, swaps, transfers, and more).\n\n' +
    'Choose an action:',
  'help.title': '❓ <b>Help</b>',
  'help.body':
    '❓ <b>Help</b>\n\n' +
    '• <b>My wallets</b> — list, labels, filters, removal.\n' +
    '• <b>Add</b> — send an EQ…/UQ…/raw address (a list works too).\n' +
    '• <b>Groups</b> — organize your wallets.\n' +
    '• <b>Filters</b> — which events to receive.\n' +
    '• <b>Settings</b> — language, explorer, import/export.\n\n' +
    'Commands: /add, /list, /remove, /groups, /stats, /settings, /lang, /help.',

  // ── wallets list ──
  'wallets.title': (n: number) => `👛 <b>Your wallets</b> (${n}):`,
  'wallets.empty': "You don't have any wallets yet. Add the first one:",
  'wallets.addBtn': '➕ Add wallet',
  'wallets.delete': '🗑 Remove',

  // ── multi-delete mode ──
  'del.title': (n: number) =>
    `🗑 <b>Remove wallets</b>\n\nMark wallets to remove and press “Confirm”.\n` +
    `Selected: <b>${n}</b>`,
  'del.confirm': (n: number) => `🗑 Remove (${n})`,
  'del.cancel': '❌ Cancel',
  'del.none': 'Nothing selected',
  'del.done': (n: number) => `Removed: ${n}`,

  // ── wallet card ──
  'wallet.group': '🗂 Group',
  'wallet.noGroup': '—',
  'wallet.filters': '🔔 Filters',
  'wallet.filtersAll': 'all',
  'wallet.label': '🏷 Label',
  'wallet.deleteOne': '🗑 Remove',
  'wallet.openIn': (name: string) => `🔗 Open in ${name}`,
  'wallet.card': (p: { title: string; friendly: string; group: string; filters: string; link: string; explorer: string }) =>
    `👛 <b>${p.title}</b>\n` +
    `📄 <code>${p.friendly}</code>\n` +
    `🗂 Group: ${p.group}\n` +
    `🔔 Filters: ${p.filters}\n` +
    `🔗 <a href="${p.link}">Open in ${p.explorer}</a>`,
  'wallet.notFound': 'Wallet not found',

  // ── add ──
  'add.prompt':
    '➕ Send a TON wallet address (EQ… / UQ… / raw).\n\n' +
    'You can include a label after a space:\n' +
    '<code>EQBom4slLIetxxKbAMYRD61BQwsxRnR_Tm0AO5ejiXsSYuYT Farm</code>\n\n' +
    'Or several at once — one per line:\n' +
    '<code>EQBC8...704IR farm\nUQCR2...CCoHMuO farm 2</code>',
  'add.noAddr': "Couldn't find any address. Check the format.",
  'add.invalid': "⚠️ This doesn't look like a TON wallet. Check EQ…/UQ… or raw format.",
  'add.addedCard': (p: { address: string; interval: number }) =>
    `✅ <b>Wallet added to tracking</b>\n\n` +
    `👛 Address: <code>${p.address}</code>\n` +
    `🔎 Status: <b>active</b>\n` +
    `⏱ Check: every <b>${p.interval}</b>s + instant TonAPI stream\n\n` +
    `I will notify you when a new transaction appears.`,
  'add.duplicateCard': (p: { address: string }) =>
    `♻️ <b>Wallet is already tracked</b>\n\n` +
    `👛 Address: <code>${p.address}</code>\n\n` +
    `New transaction notifications are already enabled.`,
  'add.result': (p: { added: number; dup: number; invalid: number }) =>
    `✅ Added: ${p.added}\n♻️ Already tracked: ${p.dup}\n⚠️ Invalid: ${p.invalid}`,

  // ── label ──
  'label.prompt': '🏷 Send a new label for the wallet (or “-” to clear):',
  'label.updated': '🏷 Label updated.',

  // ── groups ──
  'groups.title': '🗂 <b>Your groups</b>:',
  'groups.create': '➕ Create group',
  'groups.newPrompt': 'Send a name for the new group:',
  'groups.created': '🗂 Group created.',
  'groups.deleted': 'Group deleted',
  'groups.pickTitle': '🗂 Choose a group for the wallet:',
  'groups.none': '🚫 No group',
  'groups.added': 'Added to group',
  'groups.removed': 'Removed from group',
  'groups.notFound': 'Group not found',

  // ── filters ──
  'filters.title': '🔔 Choose event types to be notified about:',
  'filters.enableAll': '🔔 Enable all',
  'filters.allOn': 'All types enabled',

  // ── stats ──
  'stats.body': (p: { wallets: number; groups: number }) =>
    `📊 <b>Stats</b>\n\n👛 Wallets: ${p.wallets}\n🗂 Groups: ${p.groups}`,

  // ── settings hub ──
  'settings.title': '⚙️ <b>Settings</b>\n\nChoose a section:',
  'settings.lang': '🌐 Language',
  'settings.explorer': '🧭 Explorer',
  'settings.io': '📁 Import / Export',

  // ── language ──
  'lang.title': (current: string) => `🌐 <b>Interface language</b>\n\nCurrent: <b>${current}</b>`,
  'lang.changed': 'Language changed',
  'lang.ru': '🇷🇺 Русский',
  'lang.en': '🇬🇧 English',

  // ── explorer ──
  'explorer.title': (current: string) =>
    `🧭 <b>Blockchain explorer</b>\n\nCurrent: <b>${current}</b>\n\n` +
    `Addresses and links in notifications open via the selected explorer.`,
  'explorer.changed': 'Explorer changed',

  // ── import / export ──
  'io.title': '📁 <b>Import / Export</b>\n\nExport or import your wallet list:',
  'io.exportJson': '📤 Export JSON',
  'io.exportCsv': '📤 CSV',
  'io.exportTxt': '📤 TXT',
  'io.import': '📥 Import',
  'io.importPrompt': '📥 Send addresses (text, one per line) or a .txt/.csv/.json file.',
  'io.fileFail': "Couldn't read the file.",
  'io.noFile': "Couldn't fetch the file.",

  // ── misc ──
  'misc.openMenu': 'Open the menu: /menu',
  'misc.copied': 'Copied',
  'misc.saved': 'Saved',
  'misc.cleared': 'Cleared',
  'misc.invalidAddr': 'Invalid address.',
  'misc.on': 'on',
  'misc.off': 'off',

  // ── notification settings ──
  'settings.notifs': '🔔 Notifications',
  'notifs.title': '🔔 <b>Notification settings</b>\n\nFormat and filters for transaction messages.',
  'set.silent': '🌨 Silent mode',
  'set.contract': '⚡ Token contract',
  'set.balances': '💼 Balances',
  'set.usd': '💵 USD in balances',
  'set.dtradeBtn': '🚀 DTrade',
  'set.redotradeBtn': '♻️ RedoTrade',
  'set.chartTf': '📈 Chart timeframe',
  'set.amount': '🎯 Amount filter',
  'set.footer': '✏️ Footer',

  // chart timeframe
  'chartTf.title': (tf: string) => `📈 <b>Chart timeframe</b>\n\nCurrent: <b>${tf}</b>`,
  'chartTf.changed': 'Timeframe changed',

  // amount filter
  'amount.title': (p: { min: string; max: string }) =>
    `🎯 <b>Amount filter (TON)</b>\n\nMin: <b>${p.min}</b>\nMax: <b>${p.max}</b>\n\n` +
    `Events with volume outside the range are not sent.`,
  'amount.setMin': '✏️ Min',
  'amount.setMax': '✏️ Max',
  'amount.clear': '🗑 Clear',
  'amount.promptMin': 'Send the minimum amount in TON (number), or “-” to clear:',
  'amount.promptMax': 'Send the maximum amount in TON (number), or “-” to clear:',
  'amount.none': 'not set',
  'amount.badNumber': 'A number is required. Try again from the filter menu.',

  // footer
  'footer.title': (cur: string) =>
    `✏️ <b>Notification footer</b>\n\nCurrent: ${cur}\n\nThis text is appended to the bottom of every notification.`,
  'footer.prompt': 'Send the footer text (up to 200 chars), or “-” to clear:',
  'footer.empty': '<i>not set</i>',

  // list sort
  'sort.byDate': '📌 By date',
  'sort.alpha': '🔤 A-Z',
  'sort.none': '🚫 Off',

  // uniqueness check
  'menu.unique': '📍 Check uniqueness',
  'unique.prompt': '📍 Send a wallet address — I will show how many of our users track it.',
  'unique.result': (n: number) => `📍 Tracked by <b>${n}</b> of our users.`,

  // ── event types (filters, short) ──
  'type.buy': 'Buy',
  'type.sell': 'Sell',
  'type.swap': 'Swap',
  'type.transfer_in': 'Transfer in',
  'type.transfer_out': 'Transfer out',
  'type.mint': 'Mint',
  'type.burn': 'Burn',
  'type.stake': 'Stake',
  'type.unstake': 'Unstake',
  'type.liquidity': 'Liquidity',
  'type.nft_in': 'NFT in',
  'type.nft_out': 'NFT out',
  'type.other': 'Other',

  // ── notifications: type headers ──
  'note.buy': '🟢 Buy',
  'note.sell': '🔴 Sell',
  'note.swap': '🔄 Swap',
  'note.transfer_in': '📥 Incoming transfer',
  'note.transfer_out': '📤 Outgoing transfer',
  'note.mint': '🪙 Mint',
  'note.burn': '🔥 Burn',
  'note.stake': '🏦 Staking',
  'note.unstake': '🏧 Unstaking',
  'note.liquidity': '💧 Liquidity',
  'note.nft_in': '🖼️ NFT received',
  'note.nft_out': '🖼️ NFT sent',
  'note.other': 'ℹ️ Action',

  // ── notifications: fields and buttons ──
  'note.pending': '⏳ <i>Processing…</i>',
  'note.token': 'Token',
  'note.contract': 'Contract',
  'note.volume': 'Volume',
  'note.balance': 'Balance',
  'note.latency': 'Latency',
  'note.sec': 's',
  'note.btnDtrade': '🚀 Dtrade',
  'note.btnContract': '📋 Contract',

  // ── wallet lookup (God's Eye) ──
  'lookup.card': (p: { friendly: string; ton: string; usd: string; jettons: string; trackers: number; link: string; explorer: string }) =>
    `🔍 <b>Wallet info</b>\n\n` +
    `📄 <code>${p.friendly}</code>\n` +
    `💎 Balance: <b>${p.ton} TON</b>${p.usd}\n` +
    `🪙 Jettons: ${p.jettons}\n` +
    `📍 Tracked by us: ${p.trackers}\n` +
    `🔗 <a href="${p.link}">Open in ${p.explorer}</a>`,
  'lookup.fail': 'Failed to fetch wallet data.',
};

const DICT: Record<Lang, Record<string, Entry>> = { ru: RU, en: EN };

type Key = keyof typeof RU;

/**
 * Перевод строки. Для параметризованных ключей передаём один аргумент
 * (строку или объект параметров) — он уходит в функцию-шаблон.
 */
export function tr(lang: Lang, key: Key, arg?: unknown): string {
  const entry = (DICT[lang] ?? DICT[DEFAULT_LANG])[key] ?? RU[key];
  if (typeof entry === 'function') return (entry as (a: unknown) => string)(arg);
  return entry;
}

/** Короткое имя типа события для фильтров. */
export function typeName(lang: Lang, t: EventType): string {
  return tr(lang, `type.${t}` as Key);
}

/** Заголовок типа события для уведомления (с цветным эмодзи). */
export function noteLabel(lang: Lang, t: EventType): string {
  return tr(lang, `note.${t}` as Key);
}
