import { describe, expect, it } from 'vitest';
import { ZERO, assertValidTime, isTime } from '../src/time.js';

describe('time', () => {
  it('accepts non-negative safe integers', () => {
    expect(isTime(0)).toBe(true);
    expect(isTime(1_000_000)).toBe(true);
    expect(isTime(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('rejects negatives, fractions, NaN, and non-numbers', () => {
    expect(isTime(-1)).toBe(false);
    expect(isTime(1.5)).toBe(false);
    expect(isTime(Number.NaN)).toBe(false);
    expect(isTime('100')).toBe(false);
    expect(isTime(undefined)).toBe(false);
  });

  it('exports ZERO', () => {
    expect(ZERO).toBe(0);
  });

  it('assertValidTime throws on invalid input', () => {
    expect(() => assertValidTime(10)).not.toThrow();
    expect(() => assertValidTime(-5)).toThrow(/Time must be a non-negative safe integer/);
  });
});
