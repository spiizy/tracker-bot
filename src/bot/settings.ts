/**
 * Пользовательские настройки уведомлений/формата, хранящиеся в users.settings (jsonb).
 * Читаем через normalizeSettings (мердж на дефолты), пишем частичным патчем.
 */
export interface UserSettings {
  silent: boolean; // тихий режим — уведомления без звука
  showContract: boolean; // показывать адрес контракта токена в уведомлении
  footer: string | null; // свой текст-подпись под уведомлениями
  minTon: number | null; // фильтр суммы: не слать события дешевле, TON
  maxTon: number | null; // фильтр суммы: не слать события дороже, TON
  dtrade: boolean; // кнопка DTrade в уведомлении
  redotrade: boolean; // кнопка RedoTrade в уведомлении
  showBalances: boolean; // балансы кошелька в уведомлении
  showUsd: boolean; // показывать USD-эквивалент в балансах
  chartTf: ChartTf; // период свечей для графика-фолбэка
  sort: SortMode; // сортировка списка кошельков
}

export type SortMode = 'date' | 'alpha' | 'none';
export type ChartTf = '5m' | '15m' | '30m' | '1h' | '4h';
export const CHART_TFS: ChartTf[] = ['5m', '15m', '30m', '1h', '4h'];

export const DEFAULT_SETTINGS: UserSettings = {
  silent: false,
  showContract: true,
  footer: null,
  minTon: null,
  maxTon: null,
  dtrade: true,
  redotrade: false,
  showBalances: false,
  showUsd: false,
  chartTf: '15m',
  sort: 'alpha',
};

/** Мердж сохранённого частичного объекта на дефолты + валидация типов. */
export function normalizeSettings(raw: unknown): UserSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    silent: bool(s.silent, DEFAULT_SETTINGS.silent),
    showContract: bool(s.showContract, DEFAULT_SETTINGS.showContract),
    footer: typeof s.footer === 'string' && s.footer.trim() ? s.footer.slice(0, 200) : null,
    minTon: numOrNull(s.minTon),
    maxTon: numOrNull(s.maxTon),
    dtrade: bool(s.dtrade, DEFAULT_SETTINGS.dtrade),
    redotrade: bool(s.redotrade, DEFAULT_SETTINGS.redotrade),
    showBalances: bool(s.showBalances, DEFAULT_SETTINGS.showBalances),
    showUsd: bool(s.showUsd, DEFAULT_SETTINGS.showUsd),
    chartTf: (CHART_TFS as string[]).includes(s.chartTf as string)
      ? (s.chartTf as ChartTf)
      : DEFAULT_SETTINGS.chartTf,
    sort: s.sort === 'date' ? 'date' : s.sort === 'none' ? 'none' : 'alpha',
  };
}
