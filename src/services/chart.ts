import { logger } from '../logger.js';
import { toFriendly } from '../ton/address.js';

const GECKO = 'https://api.geckoterminal.com/api/v2';
const QUICKCHART = 'https://quickchart.io/chart';
const NETWORK = 'ton';

// Брендированный график DTrade (готовый PNG одним GET). Требует браузерных
// заголовков — без них сервер отдаёт обрезанный поток.
const DTRADE_CHART = 'https://image-api.xdtrade.com/api/v1/chart';
const DTRADE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DTRADE_TIMEOUT_MS = 6000;
// Полный завершающий чанк PNG (IEND) — проверяем, что картинка не обрезана.
const PNG_IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

interface CacheEntry {
  buf: Buffer | null;
  expires: number;
}

/**
 * Рендерит свечной график токена: основной источник — DTrade (красивый
 * брендированный PNG), фолбэк — GeckoTerminal (OHLCV) → QuickChart.
 * Best-effort: при любой ошибке/отсутствии данных возвращает null (уведомление
 * уйдёт без картинки). Кэш на токен + дедуп параллельных запросов, чтобы при
 * нескольких подписчиках одного кошелька рендерить один раз.
 */
export class ChartService {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<Buffer | null>>();
  private readonly ttlMs = 60_000;

  /** PNG-картинка графика по контракту токена (raw или friendly) или null. */
  async getImage(contractRaw: string, symbol?: string, tf?: string): Promise<Buffer | null> {
    const key = `${contractRaw}|${tf ?? ''}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.buf;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const task = this.build(contractRaw, symbol, tf)
      .then((buf) => {
        this.cache.set(key, { buf, expires: Date.now() + this.ttlMs });
        return buf;
      })
      .catch((err) => {
        logger.warn({ err: String(err) }, 'chart build failed');
        this.cache.set(key, { buf: null, expires: Date.now() + this.ttlMs });
        return null;
      })
      .finally(() => this.inflight.delete(key));

    this.inflight.set(key, task);
    return task;
  }

  private async build(contractRaw: string, symbol?: string, tf?: string): Promise<Buffer | null> {
    const address = toFriendly(contractRaw);
    // 1) основной источник — DTrade (период у него фиксированный)
    const dt = await this.dtrade(address);
    if (dt) return dt;
    // 2) фолбэк — GeckoTerminal → QuickChart (учитывает период)
    return this.geckoQuickchart(address, symbol, tf);
  }

  /**
   * Готовый PNG-график от DTrade. timestamp округляем до 5-минутного бакета:
   * свежесть + попадание в Cloudflare-кэш внутри окна. Возвращает null при
   * таймауте/ошибке/обрезанном PNG — тогда сработает фолбэк.
   */
  private async dtrade(address: string): Promise<Buffer | null> {
    const bucket = Math.floor(Date.now() / 300_000) * 300; // 5 мин, в секундах
    const url =
      `${DTRADE_CHART}?theme=dark&metric=price&base=${address}&quote=USD&timestamp=${bucket}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': DTRADE_UA, Referer: 'https://xdtrade.com/', Accept: 'image/png,*/*' },
        signal: AbortSignal.timeout(DTRADE_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      // отбрасываем обрезанный поток (нет завершающего IEND)
      if (buf.length < 1000 || !buf.subarray(-8).equals(PNG_IEND)) {
        logger.warn({ size: buf.length }, 'dtrade chart incomplete');
        return null;
      }
      return buf;
    } catch (err) {
      logger.warn({ err: String(err) }, 'dtrade chart failed');
      return null;
    }
  }

  private async geckoQuickchart(address: string, symbol?: string, tf?: string): Promise<Buffer | null> {
    const pool = await this.topPool(address);
    if (!pool) return null;
    const tfc = geckoTf(tf);
    const candles = await this.ohlcv(pool, tfc);
    if (candles.length < 2) return null;
    return this.render(candles, `${symbol ?? 'TOKEN'} • ${tfc.label}`);
  }

  /** Самый ликвидный пул токена. */
  private async topPool(address: string): Promise<string | null> {
    const json = await fetchJson<{
      data: { attributes: { address: string; reserve_in_usd?: string } }[];
    }>(`${GECKO}/networks/${NETWORK}/tokens/${encodeURIComponent(address)}/pools`);
    const pools = json?.data ?? [];
    if (pools.length === 0) return null;
    pools.sort(
      (a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0),
    );
    return pools[0]!.attributes.address;
  }

  /** Последние свечи пула по выбранному таймфрейму. */
  private async ohlcv(pool: string, tfc: GeckoTf): Promise<Candle[]> {
    const json = await fetchJson<{ data: { attributes: { ohlcv_list: number[][] } } }>(
      `${GECKO}/networks/${NETWORK}/pools/${encodeURIComponent(pool)}/ohlcv/${tfc.res}?aggregate=${tfc.agg}&limit=48`,
    );
    const list = json?.data?.attributes?.ohlcv_list ?? [];
    return list
      .map((c) => ({ t: c[0]! * 1000, o: c[1]!, h: c[2]!, l: c[3]!, c: c[4]! }))
      .sort((a, b) => a.t - b.t);
  }

  /** Конфиг Chart.js (candlestick) → PNG через QuickChart. title уже с таймфреймом. */
  private async render(candles: Candle[], title: string): Promise<Buffer | null> {
    const chart = {
      type: 'candlestick',
      data: {
        datasets: [
          {
            label: title,
            data: candles.map((c) => ({ x: c.t, o: c.o, h: c.h, l: c.l, c: c.c })),
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          title: { display: true, text: title, color: '#e6e6e6' },
        },
        scales: {
          x: { type: 'time', ticks: { color: '#9aa0a6' }, grid: { color: '#1c1f24' } },
          y: { ticks: { color: '#9aa0a6' }, grid: { color: '#1c1f24' } },
        },
      },
    };

    const res = await fetch(QUICKCHART, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart,
        width: 640,
        height: 360,
        format: 'png',
        version: '4',
        backgroundColor: '#0e0f12',
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'quickchart failed');
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  }
}

interface Candle {
  t: number; // ms
  o: number;
  h: number;
  l: number;
  c: number;
}

interface GeckoTf {
  res: 'minute' | 'hour';
  agg: number;
  label: string;
}

/** Период настроек → таймфрейм GeckoTerminal (minute поддерживает agg 1/5/15). */
function geckoTf(tf?: string): GeckoTf {
  switch (tf) {
    case '5m':
      return { res: 'minute', agg: 5, label: '5m' };
    case '30m':
      return { res: 'minute', agg: 15, label: '30m' };
    case '1h':
      return { res: 'hour', agg: 1, label: '1h' };
    case '4h':
      return { res: 'hour', agg: 4, label: '4h' };
    case '15m':
    default:
      return { res: 'minute', agg: 15, label: '15m' };
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}
