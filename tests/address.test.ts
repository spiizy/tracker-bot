import { describe, it, expect } from 'vitest';
import { normalizeAddress, sameAddress, toFriendly } from '../src/ton/address.js';

const RAW = '0:0000000000000000000000000000000000000000000000000000000000000000';

describe('normalizeAddress', () => {
  it('accepts raw form and returns raw', () => {
    expect(normalizeAddress(RAW)).toBe(RAW);
  });

  it('accepts friendly form and normalizes to the same raw', () => {
    const friendly = toFriendly(RAW);
    expect(normalizeAddress(friendly)).toBe(RAW);
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeAddress(`  ${RAW}  `)).toBe(RAW);
  });

  it('rejects garbage', () => {
    expect(normalizeAddress('not-an-address')).toBeNull();
    expect(normalizeAddress('')).toBeNull();
    expect(normalizeAddress('0:zz')).toBeNull();
  });
});

describe('sameAddress', () => {
  it('matches different representations of the same address', () => {
    expect(sameAddress(RAW, toFriendly(RAW))).toBe(true);
  });
  it('returns false for undefined inputs', () => {
    expect(sameAddress(undefined, RAW)).toBe(false);
    expect(sameAddress(RAW, undefined)).toBe(false);
  });
});
