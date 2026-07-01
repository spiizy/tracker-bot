import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InlineKeyboard, InputFile } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../bot/context.js';
import { logger } from '../logger.js';
import { metrics } from '../metrics.js';
import * as statsRepo from '../repo/stats.js';
import { shortAddress, toFriendly } from '../ton/address.js';
import type { WalletEvent } from '../ton/types.js';
import { type Lang, asLang, noteLabel, tr } from '../bot/i18n.js';
import { type ExplorerId, asExplorer, explorerName, txLink } from './explorer.js';

// Картинка-заглушка, которую показываем мгновенно и потом подменяем графиком.
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const PLACEHOLDER: Buffer = (() => {
  try {
    return readFileSync(join(process.cwd(), 'assets', 'loading.png'));
  } catch {
    logger.warn('assets/loading.png not found, using 1x1 fallback');
    return FALLBACK_PNG;
  }
})();

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Ссылка для Dtrade строго в формате из ТЗ. */
export function dtradeLink(tokenContract: string): string {
  return `https://t.me/dtrade?start=rifle_${tokenContract}`;
}

/** Ссылка для RedoTrade: реф-префикс + friendly-адрес токена (аналог Dtrade). */
export function redotradeLink(tokenContract: string): string {
  return `https://t.me/redotrade?start=rE2jNeaD-${tokenContract}`;
}

export interface RenderOpts {
  lang?: Lang;
  explorer?: ExplorerId;
  pending?: boolean;
  showContract?: boolean; // показывать адрес контракта (по умолчанию да)
  footer?: string | null; // текст-подпись внизу
  dtrade?: boolean; // кнопка DTrade (по умолчанию да)
  redotrade?: boolean; // кнопка RedoTrade (по умолчанию нет)
  balances?: string | null; // готовая строка балансов (bundle C)
}

export interface RenderedNotification {
  text: string;
  keyboard: InlineKeyboard;
}

/** Готовит текст + клавиатуру уведомления. Чистая функция — удобно тестировать. */
export function renderNotification(
  event: WalletEvent,
  label: string | null,
  latencyMs: number | null,
  opts: RenderOpts = {},
): RenderedNotification {
  const lang = asLang(opts.lang);
  const explorer = asExplorer(opts.explorer);
  const showContract = opts.showContract ?? true;
  const dtrade = opts.dtrade ?? true;
  const redotrade = opts.redotrade ?? false;
  const lines: string[] = [];

  lines.push(`<b>${noteLabel(lang, event.type)}</b>`);
  if (opts.pending) lines.push(tr(lang, 'note.pending'));

  const name = label
    ? `${esc(label)} (<code>${shortAddress(event.walletRaw)}</code>)`
    : `<code>${shortAddress(event.walletRaw)}</code>`;
  lines.push(`👛 ${name}`);

  if (event.token) {
    const sym = event.token.symbol ?? event.token.name ?? 'Token';
    const amt = event.amount ? `${esc(event.amount)} ` : '';
    lines.push(`💎 ${tr(lang, 'note.token')}: ${amt}<b>${esc(sym)}</b>`);
    if (event.token.address && showContract) {
      lines.push(`📄 ${tr(lang, 'note.contract')}: <code>${esc(toFriendly(event.token.address))}</code>`);
    }
  }
  if (opts.balances) lines.push(opts.balances);
  if (event.comment) lines.push(`💬 ${esc(event.comment)}`);
  if (event.type === 'other') lines.push(`ℹ️ ${esc(event.description)}`);
  if (opts.footer) lines.push(`\n<i>${esc(opts.footer)}</i>`);

  const keyboard = new InlineKeyboard();
  const contract = event.token?.address ? toFriendly(event.token.address) : undefined;
  // 1-я строка — trade-кнопки (что включено), 2-я строка — всегда Explorer
  let hasTrade = false;
  if (contract && dtrade) {
    keyboard.url(tr(lang, 'note.btnDtrade'), dtradeLink(contract));
    hasTrade = true;
  }
  if (contract && redotrade) {
    keyboard.url('♻️ RedoTrade', redotradeLink(contract));
    hasTrade = true;
  }
  if (hasTrade) keyboard.row();
  keyboard.url(`🔍 ${explorerName(explorer)}`, txLink(explorer, event.txHash));

  return { text: lines.join('\n'), keyboard };
}

/** Настройки получателя, влияющие на рендер и доставку. */
export interface RecipientPrefs {
  lang: string;
  explorer: string;
  silent?: boolean;
  showContract?: boolean;
  footer?: string | null;
  dtrade?: boolean;
  redotrade?: boolean;
  showBalances?: boolean;
  showUsd?: boolean;
  chartTf?: string; // период графика для gecko-фолбэка
  balances?: string | null; // готовая строка баланса (подставляет watcher)
}

/**
 * Отправка уведомлений. Глобальный троттлинг и авто-ретрай 429 настроены
 * трансформерами на bot.api (см. bot/index.ts), поэтому тут просто отправляем.
 */
export class Notifier {
  // file_id заглушки после первой загрузки — чтобы не переотправлять байты.
  private placeholderFileId?: string;

  constructor(private readonly bot: Bot<BotContext>) {}

  private render(event: WalletEvent, label: string | null, prefs: RecipientPrefs, pending: boolean) {
    const latency = pending ? null : this.latency(event);
    return renderNotification(event, label, latency, {
      lang: asLang(prefs.lang),
      explorer: asExplorer(prefs.explorer),
      pending,
      showContract: prefs.showContract,
      footer: prefs.footer,
      dtrade: prefs.dtrade,
      redotrade: prefs.redotrade,
      balances: prefs.balances,
    });
  }

  /**
   * Шлёт уведомление. Для событий с графиком (asPhoto) — фото с заглушкой,
   * текст в подписи; иначе обычное текстовое сообщение. Возвращает message_id.
   */
  async send(
    userId: number,
    event: WalletEvent,
    label: string | null,
    prefs: RecipientPrefs,
    pending: boolean,
    asPhoto: boolean,
  ): Promise<number | null> {
    const { text, keyboard } = this.render(event, label, prefs, pending);
    const silent = prefs.silent ?? false;
    try {
      if (asPhoto) {
        const media = this.placeholderFileId ?? new InputFile(PLACEHOLDER);
        const msg = await this.bot.api.sendPhoto(userId, media, {
          caption: text,
          parse_mode: 'HTML',
          reply_markup: keyboard,
          disable_notification: silent,
        });
        const photo = msg.photo?.at(-1);
        if (!this.placeholderFileId && photo) this.placeholderFileId = photo.file_id;
        this.countSent();
        return msg.message_id;
      }
      const msg = await this.bot.api.sendMessage(userId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
        disable_notification: silent,
      });
      this.countSent();
      return msg.message_id;
    } catch (err) {
      metrics.notificationsFailed++;
      // 403 = пользователь заблокировал бота; не считаем фатальным
      logger.warn({ userId, err: String(err) }, 'notify send failed');
      return null;
    }
  }

  /**
   * Доводит уже отправленное сообщение до финального состояния: убирает «в обработке»,
   * проставляет задержку и (для графика) подменяет картинку, если она готова.
   */
  async editToFinal(
    userId: number,
    messageId: number,
    event: WalletEvent,
    label: string | null,
    prefs: RecipientPrefs,
    asPhoto: boolean,
    chart?: Buffer,
  ): Promise<void> {
    const { text, keyboard } = this.render(event, label, prefs, false);
    try {
      if (asPhoto) {
        if (chart) {
          await this.bot.api.editMessageMedia(
            userId,
            messageId,
            { type: 'photo', media: new InputFile(chart), caption: text, parse_mode: 'HTML' },
            { reply_markup: keyboard },
          );
        } else {
          await this.bot.api.editMessageCaption(userId, messageId, {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });
        }
      } else {
        await this.bot.api.editMessageText(userId, messageId, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (err) {
      logger.warn({ userId, err: String(err) }, 'notify finalize failed');
    }
  }

  private latency(event: WalletEvent): number {
    return Math.max(0, Date.now() - event.timestamp * 1000);
  }

  private countSent(): void {
    metrics.notificationsSent++;
    void statsRepo.increment('notifications_sent');
  }
}
