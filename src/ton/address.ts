import { Address } from '@ton/core';

/**
 * Валидирует и нормализует TON-адрес в raw-форму (0:hex) для использования
 * как глобального ключа. Принимает и friendly (EQ.../UQ...), и raw.
 * Возвращает null, если адрес невалиден.
 */
export function normalizeAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return Address.parse(trimmed).toRawString();
  } catch {
    return null;
  }
}

/** Friendly-форма (bounceable, для показа/ссылок). */
export function toFriendly(raw: string): string {
  try {
    return Address.parse(raw).toString({ bounceable: true, urlSafe: true });
  } catch {
    return raw;
  }
}

/** Короткая форма адреса для UI: EQAB…wXyz */
export function shortAddress(addr: string): string {
  const f = toFriendly(addr);
  return f.length > 12 ? `${f.slice(0, 6)}…${f.slice(-4)}` : f;
}

/** Сравнение адресов независимо от формы записи. */
export function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return na !== null && na === nb;
}
