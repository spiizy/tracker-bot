import { logger } from '../logger.js';
import { metrics } from '../metrics.js';
import { config } from '../config.js';
import * as walletRepo from '../repo/wallets.js';
import * as subRepo from '../repo/subscriptions.js';
import { classifyEvent } from '../ton/classify.js';
import { getAccountEvents } from '../ton/tonapi.js';
import { TonStream, type TxMessage } from '../ton/stream.js';
import type { EventType, TonApiEvent, WalletEvent } from '../ton/types.js';
import type { Notifier, RecipientPrefs } from './notify.js';
import type { Subscriber } from '../repo/subscriptions.js';
import { normalizeSettings, type UserSettings } from '../bot/settings.js';
import { asLang, tr } from '../bot/i18n.js';
import { ChartService } from './chart.js';
import { BalanceService } from './balance.js';

/**
 * Оркестратор отслеживания: SSE как быстрый триггер + добор событий из REST
 * с курсором last_lt для дедупликации, плюс страхующий периодический sweep.
 *
 * Скорость и надёжность (pending-UX):
 *  - события забираются вместе с `in_progress` (незавершёнными);
 *  - на первое появление незавершённого события шлём «⏳ в обработке»,
 *    при финализации редактируем это же сообщение в финал;
 *  - курсор двигается только по финализированным событиям, а pending держим
 *    по event_id, чтобы не застревать на старых финальных событиях;
 *  - дедуп финальных отправок — по event_id (sentFinal).
 */
const CHARTABLE: ReadonlySet<EventType> = new Set<EventType>(['buy', 'sell', 'swap']);

interface SentMsg {
  userId: number;
  messageId: number;
  label: string | null;
  prefs: RecipientPrefs;
}
interface PendingEntry {
  sent: SentMsg[];
  asPhoto: boolean;
  createdAt: number;
}
export interface EventPlan {
  pending: TonApiEvent[];
  final: TonApiEvent[];
  cursorLt: bigint;
  cursorEventId: string | null;
}

const PENDING_TTL_MS = 5 * 60_000; // незавершённое держим в памяти не дольше 5 мин
const SENT_TTL_MS = 10 * 60_000; // дедуп финальных — окно 10 мин

export class Watcher {
  private readonly stream: TonStream;
  private readonly chart = new ChartService();
  private readonly balance = new BalanceService();
  // кэш курсора в памяти, чтобы не ходить в БД на горячем пути обработки tx
  private watched = new Map<string, { id: number; lastLt: bigint; lastEventId: string | null }>();
  // защита от параллельной обработки одного кошелька
  private processing = new Set<number>();
  private rerun = new Set<number>();
  // event_id -> отправленные pending-сообщения (для редактирования в финал)
  private pendingEvents = new Map<string, PendingEntry>();
  // event_id -> timestamp финальной отправки (дедуп + прунинг)
  private sentFinal = new Map<string, number>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;
  private activeChecks = 0;
  private checkQueue: (() => void)[] = [];

  constructor(private readonly notifier: Notifier) {
    this.stream = new TonStream((msg) => this.onTx(msg));
  }

  async start(): Promise<void> {
    await this.refresh();
    await this.syncColdCursors();
    this.stream.start();
    metrics.sseConnected = this.stream.isRunning;
    this.sweepTimer = setInterval(() => void this.sweep(), config.SWEEP_INTERVAL_SEC * 1000);
    void this.sweep();
    logger.info(
      { intervalSec: config.SWEEP_INTERVAL_SEC, concurrency: config.WATCHER_CONCURRENCY },
      'Watcher started',
    );
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.stream.stop();
    metrics.sseConnected = false;
  }

  /** Перечитывает список наблюдаемых адресов и обновляет SSE-подписку. */
  async refresh(): Promise<void> {
    const rows = await walletRepo.getWatchedAddresses();
    this.watched = new Map(
      rows.map((r) => [r.address, { id: r.id, lastLt: r.lastLt, lastEventId: r.lastEventId }]),
    );
    this.stream.setAccounts(this.watched.keys());
    metrics.activeWatchers = this.watched.size;
    metrics.sseConnected = this.stream.isRunning;
    logger.info({ count: this.watched.size }, 'Watcher refreshed');
  }

  private onTx(msg: TxMessage): void {
    const entry = this.watched.get(msg.account_id);
    if (!entry) return; // не наш адрес
    void this.processWallet(entry.id, msg.account_id);
  }

  /** Обрабатывает кошелёк: добирает новые события и рассылает уведомления. */
  private async processWallet(walletId: number, addressRaw: string): Promise<number> {
    if (this.processing.has(walletId)) {
      this.rerun.add(walletId);
      return 0;
    }
    this.processing.add(walletId);
    let checked = false;
    let cursorUpdated = false;
    let finalCount = 0;
    try {
      // курсор берём из памяти (без обращения к БД) — ускоряет реакцию на tx
      const entry = this.watched.get(addressRaw);
      if (!entry) return 0;
      const baseLt = entry.lastLt;

      const events = await this.withCheckSlot(() => getAccountEvents(addressRaw, 20, true));
      checked = true;
      const plan = planWalletEvents(
        events,
        baseLt,
        entry.lastEventId,
        (id) => this.pendingEvents.has(id),
        (id) => this.sentFinal.has(id),
      );

      for (const raw of plan.pending) {
        await this.emitPending(walletId, addressRaw, raw);
      }
      for (const raw of plan.final) {
        await this.emitFinal(walletId, addressRaw, raw);
        finalCount++;
      }

      if (plan.cursorLt > baseLt && plan.cursorEventId) {
        await walletRepo.updateCursor(walletId, plan.cursorLt, plan.cursorEventId);
        cursorUpdated = true;
        entry.lastLt = plan.cursorLt;
        entry.lastEventId = plan.cursorEventId;
      }
    } catch (err) {
      logger.error({ walletId, err: String(err) }, 'processWallet failed');
    } finally {
      if (checked && !cursorUpdated) {
        void walletRepo
          .markChecked(walletId)
          .catch((err) => logger.error({ walletId, err: String(err) }, 'markChecked failed'));
      }
      this.processing.delete(walletId);
      if (this.rerun.delete(walletId)) void this.processWallet(walletId, addressRaw);
    }
    return finalCount;
  }

  /** Получатели события с учётом фильтров типа и фильтра суммы. */
  private async recipients(walletId: number, event: WalletEvent) {
    const subs = await subRepo.getSubscribers(walletId);
    return subs.filter((s) => {
      if (s.filters && !s.filters.includes(event.type)) return false;
      return passesAmount(normalizeSettings(s.settings), event);
    });
  }

  /** Настройки получателя → параметры рендера/доставки уведомления. */
  private prefsOf(sub: Subscriber): RecipientPrefs {
    const s = normalizeSettings(sub.settings);
    return {
      lang: sub.lang,
      explorer: sub.explorer,
      silent: s.silent,
      showContract: s.showContract,
      footer: s.footer,
      dtrade: s.dtrade,
      redotrade: s.redotrade,
      showBalances: s.showBalances,
      showUsd: s.showUsd,
      chartTf: s.chartTf,
    };
  }

  /**
   * Достраивает строку баланса для тех получателей, кто её включил.
   * Баланс кошелька один — тянем один раз, USD считаем при необходимости.
   */
  private async withBalances(
    addressRaw: string,
    event: WalletEvent,
    prefsList: RecipientPrefs[],
  ): Promise<void> {
    if (!prefsList.some((p) => p.showBalances)) return;
    const ton = await this.balance.tonBalance(addressRaw);
    if (ton === null) return;
    const wantUsd = prefsList.some((p) => p.showBalances && p.showUsd);
    const rate = wantUsd ? await this.balance.tonUsd() : null;
    // баланс монеты события (одинаков для всех получателей)
    let tokenPart = '';
    if (event.token?.address) {
      const amt = await this.balance.jettonAmount(addressRaw, event.token.address);
      const sym = (event.token.symbol ?? event.token.name ?? '').replace(/[<&>]/g, '');
      if (amt !== null && sym) tokenPart = ` · ${amt} ${sym}`;
    }
    for (const p of prefsList) {
      if (!p.showBalances) continue;
      const usd = p.showUsd && rate ? ` (~$${Math.round(ton * rate)})` : '';
      p.balances = `💼 ${tr(asLang(p.lang), 'note.balance')}: <b>${ton.toFixed(2)} TON</b>${usd}${tokenPart}`;
    }
  }

  private chartable(event: WalletEvent): boolean {
    return config.CHART_ENABLED && CHARTABLE.has(event.type) && !!event.token?.address;
  }

  /** Первое появление незавершённого события: шлём «в обработке». */
  private async emitPending(walletId: number, addressRaw: string, raw: TonApiEvent): Promise<void> {
    const event = classifyEvent(raw, addressRaw);
    if (!event) {
      this.pendingEvents.set(raw.event_id, { sent: [], asPhoto: false, createdAt: Date.now() });
      return;
    }
    const asPhoto = this.chartable(event);
    const sent: SentMsg[] = [];
    for (const sub of await this.recipients(walletId, event)) {
      const prefs = this.prefsOf(sub);
      const messageId = await this.notifier.send(sub.userId, event, sub.label, prefs, true, asPhoto);
      if (messageId !== null) sent.push({ userId: sub.userId, messageId, label: sub.label, prefs });
    }
    this.pendingEvents.set(raw.event_id, { sent, asPhoto, createdAt: Date.now() });
  }

  /** Финализация события: правим pending-сообщения или шлём финал напрямую. */
  private async emitFinal(walletId: number, addressRaw: string, raw: TonApiEvent): Promise<void> {
    const event = classifyEvent(raw, addressRaw);
    if (!event) {
      this.sentFinal.set(raw.event_id, Date.now());
      return;
    }
    metrics.recordEvent(Math.max(0, Date.now() - event.timestamp * 1000));
    const tracked = this.pendingEvents.get(raw.event_id);

    if (tracked && tracked.sent.length > 0) {
      // правим в той же форме (фото/текст), в которой pending был реально отправлен
      const asPhoto = tracked.asPhoto;
      await this.withBalances(addressRaw, event, tracked.sent.map((s) => s.prefs));
      const chart = asPhoto && event.token?.address
        ? await this.chart.getImage(event.token.address, event.token.symbol, tracked.sent[0]?.prefs.chartTf)
        : null;
      for (const s of tracked.sent) {
        await this.notifier.editToFinal(s.userId, s.messageId, event, s.label, s.prefs, asPhoto, chart ?? undefined);
      }
      this.pendingEvents.delete(raw.event_id);
    } else {
      if (tracked) this.pendingEvents.delete(raw.event_id);
      const asPhoto = this.chartable(event);
      // pending не показывали (событие пришло уже финальным) — шлём сразу финал
      const targets = (await this.recipients(walletId, event)).map((sub) => ({ sub, prefs: this.prefsOf(sub) }));
      await this.withBalances(addressRaw, event, targets.map((t) => t.prefs));
      const sent: SentMsg[] = [];
      for (const { sub, prefs } of targets) {
        const messageId = await this.notifier.send(sub.userId, event, sub.label, prefs, false, asPhoto);
        if (messageId !== null && asPhoto) sent.push({ userId: sub.userId, messageId, label: sub.label, prefs });
      }
      if (asPhoto && sent.length) void this.fillCharts(sent, event);
    }
    this.sentFinal.set(raw.event_id, Date.now());
  }

  /** Дорисовывает график в уже отправленные финальные сообщения (best-effort). */
  private async fillCharts(sent: SentMsg[], event: WalletEvent): Promise<void> {
    if (!event.token?.address) return;
    const image = await this.chart.getImage(event.token.address, event.token.symbol, sent[0]?.prefs.chartTf);
    if (!image) return;
    for (const s of sent) {
      await this.notifier.editToFinal(s.userId, s.messageId, event, s.label, s.prefs, true, image);
    }
  }

  /** Страхующий проход по всем кошелькам + прунинг памяти. */
  private async sweep(): Promise<void> {
    if (this.sweeping) {
      logger.warn('Watcher sweep skipped: previous cycle still running');
      return;
    }
    this.sweeping = true;
    metrics.sseConnected = this.stream.isRunning;
    this.prune();
    const started = Date.now();
    const jobs = [...this.watched];
    let found = 0;
    try {
      logger.info({ count: jobs.length }, 'Watcher sweep started');
      await runLimited(jobs, config.WATCHER_CONCURRENCY, async ([address, entry]) => {
        found += await this.processWallet(entry.id, address);
      });
      logger.info({ count: jobs.length, found, ms: Date.now() - started }, 'Watcher sweep finished');
    } finally {
      this.sweeping = false;
    }
  }

  /** Старые строки с last_lt=0 считаем уже синхронизированными, чтобы не слать историю. */
  private async syncColdCursors(): Promise<void> {
    const cold = [...this.watched].filter(([, entry]) => entry.lastLt === 0n);
    if (cold.length === 0) return;
    let synced = 0;
    await runLimited(cold, config.WATCHER_CONCURRENCY, async ([address, entry]) => {
      try {
        const latest = (await this.withCheckSlot(() => getAccountEvents(address, 1, false)))[0];
        if (!latest) {
          await walletRepo.markChecked(entry.id);
          return;
        }
        const lt = BigInt(latest.lt);
        await walletRepo.updateCursor(entry.id, lt, latest.event_id);
        entry.lastLt = lt;
        entry.lastEventId = latest.event_id;
        synced++;
      } catch (err) {
        logger.warn({ walletId: entry.id, err: String(err) }, 'cold cursor sync failed');
      }
    });
    logger.info({ count: cold.length, synced }, 'Watcher cold cursors synced');
  }

  /** Чистка памяти от старых pending/финальных записей. */
  private prune(): void {
    const now = Date.now();
    for (const [id, e] of this.pendingEvents) {
      if (now - e.createdAt > PENDING_TTL_MS) {
        this.pendingEvents.delete(id);
        this.sentFinal.set(id, now); // больше не пере-эмитим зависшее событие
      }
    }
    for (const [id, ts] of this.sentFinal) {
      if (now - ts > SENT_TTL_MS) this.sentFinal.delete(id);
    }
  }

  /**
   * Инициализация курсора при первом добавлении кошелька: ставим last_lt на
   * текущую вершину (по финализированным), чтобы не слать историю.
   */
  async initCursorIfNew(walletId: number, addressRaw: string, currentLt: bigint): Promise<void> {
    if (currentLt > 0n) return;
    try {
      const events = await this.withCheckSlot(() => getAccountEvents(addressRaw, 1, false));
      const latest = events[0];
      if (latest) await walletRepo.updateCursor(walletId, BigInt(latest.lt), latest.event_id);
    } catch (err) {
      logger.warn({ walletId, err: String(err) }, 'initCursor failed');
    }
  }

  private async withCheckSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeChecks >= config.WATCHER_CONCURRENCY) {
      await new Promise<void>((resolve) => this.checkQueue.push(resolve));
    }
    this.activeChecks++;
    try {
      return await fn();
    } finally {
      this.activeChecks--;
      this.checkQueue.shift()?.();
    }
  }
}

/** Проходит ли событие фильтр суммы пользователя (минимум/максимум в TON). */
function passesAmount(s: UserSettings, event: WalletEvent): boolean {
  if (!event.tonValue) return true; // нет объёма в TON — не фильтруем
  const v = Number(String(event.tonValue).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(v)) return true;
  if (s.minTon != null && v < s.minTon) return false;
  if (s.maxTon != null && v > s.maxTon) return false;
  return true;
}

export function planWalletEvents(
  events: TonApiEvent[],
  baseLt: bigint,
  lastEventId: string | null,
  hasPending: (eventId: string) => boolean,
  hasSentFinal: (eventId: string) => boolean,
): EventPlan {
  const plan: EventPlan = {
    pending: [],
    final: [],
    cursorLt: baseLt,
    cursorEventId: lastEventId,
  };
  const asc = [...events].sort((a, b) => (a.lt < b.lt ? -1 : a.lt > b.lt ? 1 : 0));

  for (const raw of asc) {
    const lt = BigInt(raw.lt);
    const isNew = lt > baseLt;
    const tracked = hasPending(raw.event_id);

    if (raw.in_progress) {
      if (isNew && !tracked) plan.pending.push(raw);
      continue;
    }

    if ((isNew || tracked) && !hasSentFinal(raw.event_id)) {
      plan.final.push(raw);
    }
    if (lt > plan.cursorLt) {
      plan.cursorLt = lt;
      plan.cursorEventId = raw.event_id;
    }
  }

  return plan;
}

async function runLimited<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      const item = items[i]!;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
