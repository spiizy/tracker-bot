import { config } from '../config.js';
import { logger } from '../logger.js';

export interface TxMessage {
  account_id: string;
  lt: number;
  tx_hash: string;
}

/**
 * Подписка на поток финализированных транзакций TonAPI через SSE.
 * Один глобальный коннект на весь набор адресов (требование
 * "один кошелёк отслеживается один раз").
 *
 * Набор адресов меняется редко (добавление/удаление кошелька), поэтому при
 * изменении просто переподключаемся с debounce — это проще WebSocket-подписок
 * и для MVP-нагрузки полностью достаточно.
 */
export class TonStream {
  private accounts = new Set<string>();
  private abort: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private backoff = 1000;
  private stopped = true;
  private running = false;

  constructor(private readonly onTx: (msg: TxMessage) => void) {}

  /** Полная замена набора отслеживаемых адресов (raw-форма). */
  setAccounts(addresses: Iterable<string>): void {
    const next = new Set(addresses);
    if (sameSet(next, this.accounts)) return;
    this.accounts = next;
    this.scheduleReconnect();
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.abort?.abort();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    // ждём, пока серия изменений уляжется (напр. импорт многих кошельков)
    this.debounceTimer = setTimeout(() => this.connect(), 1500);
  }

  private connect(): void {
    if (this.stopped) return;
    this.abort?.abort();

    if (this.accounts.size === 0) {
      this.running = false;
      logger.info('TonStream: no accounts to watch, idle');
      return;
    }

    const ctrl = new AbortController();
    this.abort = ctrl;
    const accountsParam = [...this.accounts].join(',');
    const url = `${config.TONAPI_BASE_URL}/v2/sse/accounts/transactions?accounts=${accountsParam}`;

    this.running = false;
    logger.info({ count: this.accounts.size }, 'TonStream connecting');

    void this.readStream(url, ctrl).catch((err) => {
      if (ctrl.signal.aborted) return; // намеренное переподключение
      this.running = false;
      logger.warn({ err: String(err) }, 'TonStream connection error');
      this.scheduleBackoffReconnect();
    });
  }

  private async readStream(url: string, ctrl: AbortController): Promise<void> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.TONAPI_KEY}`, Accept: 'text/event-stream' },
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`SSE status ${res.status}`);
    }

    this.running = true;
    this.backoff = 1000; // успешный коннект — сбрасываем backoff
    logger.info('TonStream connected');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('SSE stream ended');
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        this.handleFrame(frame);
      }
    }
  }

  private handleFrame(frame: string): void {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue; // комментарий/heartbeat
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (event !== 'message' || !data) return;

    try {
      const msg = JSON.parse(data) as TxMessage;
      if (msg.account_id && msg.tx_hash) this.onTx(msg);
    } catch (err) {
      logger.debug({ data, err: String(err) }, 'TonStream bad frame');
    }
  }

  private scheduleBackoffReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30_000);
    logger.info({ delay }, 'TonStream reconnect scheduled');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  get isRunning(): boolean {
    return this.running && !this.stopped;
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
