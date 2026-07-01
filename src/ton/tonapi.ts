import { config } from '../config.js';
import { logger } from '../logger.js';
import type { TonApiEvent, TonApiEventsResponse } from './types.js';

const BASE = config.TONAPI_BASE_URL;
const HEADERS = { Authorization: `Bearer ${config.TONAPI_KEY}` };

interface FetchOpts {
  timeoutMs?: number;
  retries?: number;
}

/**
 * Обёртка над fetch с таймаутом и ретраями на 429/5xx с экспоненциальным
 * backoff. Уважает Retry-After.
 */
async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { timeoutMs = config.TONAPI_TIMEOUT_MS, retries = config.TONAPI_RETRIES } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE}${path}`, { headers: HEADERS, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        throw new RetryableError(`TonAPI ${res.status}`, retryAfter * 1000);
      }
      if (!res.ok) {
        throw new Error(`TonAPI ${res.status} for ${path}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      const delay =
        err instanceof RetryableError && err.retryAfterMs
          ? err.retryAfterMs
          : Math.min(2000 * 2 ** attempt, 15_000);
      const retryable = err instanceof RetryableError || isAbortOrNetwork(err);
      if (!retryable || attempt === retries) break;
      logger.warn({ path, attempt, delay }, 'TonAPI retry');
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('TonAPI request failed');
}

class RetryableError extends Error {
  constructor(
    message: string,
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}

function isAbortOrNetwork(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TypeError');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Последние события аккаунта (новейшие первыми). limit держим небольшим —
 * SSE будит нас почти сразу, между событиями накапливается мало.
 *
 * По умолчанию возвращаем и ещё не финализированные (`in_progress`) трейсы —
 * это даёт ранние «pending»-уведомления и не теряет события, которые
 * финализируются позже соседних (см. Watcher).
 */
export async function getAccountEvents(
  address: string,
  limit = 20,
  includeInProgress = true,
): Promise<TonApiEvent[]> {
  const data = await apiFetch<TonApiEventsResponse>(
    `/v2/accounts/${encodeURIComponent(address)}/events?limit=${limit}`,
  );
  return includeInProgress ? data.events : data.events.filter((e) => !e.in_progress);
}

export interface AccountInfo {
  address: string;
  balance: number; // nanoton
  status?: string;
  name?: string;
  is_wallet?: boolean;
  last_activity?: number;
}

/** Базовая информация об аккаунте (баланс TON, статус, имя). */
export async function getAccountInfo(address: string): Promise<AccountInfo> {
  return apiFetch<AccountInfo>(`/v2/accounts/${encodeURIComponent(address)}`, { retries: 1 });
}

export interface JettonBalance {
  balance: string; // raw units
  jetton: { address: string; symbol?: string; name?: string; decimals: number };
}

/** Балансы всех джеттонов аккаунта. */
export async function getAccountJettons(address: string): Promise<JettonBalance[]> {
  const d = await apiFetch<{ balances: JettonBalance[] }>(
    `/v2/accounts/${encodeURIComponent(address)}/jettons`,
    { retries: 1 },
  );
  return d.balances ?? [];
}

/** Кол-во разных джеттонов на балансе (для инфо-карточки). */
export async function getJettonsCount(address: string): Promise<number> {
  try {
    return (await getAccountJettons(address)).length;
  } catch {
    return 0;
  }
}

/** Курс TON→USD (или null). */
export async function getTonUsdRate(): Promise<number | null> {
  try {
    const d = await apiFetch<{ rates: { TON?: { prices?: { USD?: number } } } }>(
      `/v2/rates?tokens=ton&currencies=usd`,
      { retries: 1 },
    );
    return d.rates?.TON?.prices?.USD ?? null;
  } catch {
    return null;
  }
}
