import { logger } from '../logger.js';
import { getAccountInfo, getTonUsdRate, getAccountJettons } from '../ton/tonapi.js';
import { normalizeAddress } from '../ton/address.js';
import { formatUnits } from '../ton/format.js';

/**
 * Балансы кошельков и курс TON→USD с коротким кэшем. Best-effort: при ошибке
 * возвращает null, чтобы уведомление ушло без строки баланса.
 */
export class BalanceService {
  private bal = new Map<string, { ton: number; ts: number }>();
  private rate: { usd: number | null; ts: number } = { usd: null, ts: 0 };
  private readonly ttl = 30_000;
  private readonly rateTtl = 60_000;

  /** Баланс TON (целые TON, не нанотоны) или null. */
  async tonBalance(addressRaw: string): Promise<number | null> {
    const c = this.bal.get(addressRaw);
    if (c && Date.now() - c.ts < this.ttl) return c.ton;
    try {
      const info = await getAccountInfo(addressRaw);
      const ton = info.balance / 1e9;
      this.bal.set(addressRaw, { ton, ts: Date.now() });
      return ton;
    } catch (err) {
      logger.warn({ err: String(err) }, 'tonBalance failed');
      return null;
    }
  }

  /** Курс TON→USD (кэш 60с) или null. */
  async tonUsd(): Promise<number | null> {
    if (Date.now() - this.rate.ts < this.rateTtl) return this.rate.usd;
    const usd = await getTonUsdRate();
    this.rate = { usd, ts: Date.now() };
    return usd;
  }

  // кэш списка джеттонов на кошелёк (raw master -> человекочитаемое кол-во)
  private jet = new Map<string, { byMaster: Map<string, string>; ts: number }>();

  /**
   * Человекочитаемый баланс конкретного джеттона на кошельке. '0' — если не держит,
   * null — если не удалось получить.
   */
  async jettonAmount(walletRaw: string, jettonMasterRaw: string): Promise<string | null> {
    const master = normalizeAddress(jettonMasterRaw) ?? jettonMasterRaw;
    let cached = this.jet.get(walletRaw);
    if (!cached || Date.now() - cached.ts >= this.ttl) {
      try {
        const balances = await getAccountJettons(walletRaw);
        const byMaster = new Map<string, string>();
        for (const b of balances) {
          const m = normalizeAddress(b.jetton.address) ?? b.jetton.address;
          byMaster.set(m, formatUnits(b.balance, b.jetton.decimals));
        }
        cached = { byMaster, ts: Date.now() };
        this.jet.set(walletRaw, cached);
      } catch (err) {
        this.jet.set(walletRaw, { byMaster: new Map(), ts: Date.now() });
        const log = isTonApiRateLimit(err) ? logger.debug.bind(logger) : logger.warn.bind(logger);
        log({ err: String(err) }, 'jettonAmount failed');
        return null;
      }
    }
    return cached.byMaster.get(master) ?? '0';
  }
}

function isTonApiRateLimit(err: unknown): boolean {
  return err instanceof Error && err.message.includes('TonAPI 429');
}
