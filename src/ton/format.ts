/**
 * Форматирует целочисленное кол-во в минимальных единицах в человекочитаемое
 * с учётом decimals. Без потери точности через BigInt.
 */
export function formatUnits(amount: string | number | bigint, decimals: number): string {
  let value: bigint;
  try {
    value = BigInt(typeof amount === 'number' ? Math.trunc(amount) : amount);
  } catch {
    return String(amount);
  }
  const negative = value < 0n;
  if (negative) value = -value;

  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;

  let fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  // не более 6 знаков после запятой в UI
  if (fracStr.length > 6) fracStr = fracStr.slice(0, 6);

  const sign = negative ? '-' : '';
  const wholeStr = withThousands(whole.toString());
  return fracStr ? `${sign}${wholeStr}.${fracStr}` : `${sign}${wholeStr}`;
}

/** Нанотоны (1e9) -> TON. */
export function formatTon(nanoton: number | bigint): string {
  return formatUnits(typeof nanoton === 'number' ? Math.trunc(nanoton) : nanoton, 9);
}

function withThousands(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
