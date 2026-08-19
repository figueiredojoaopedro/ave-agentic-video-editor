/**
 * Internal time representation: integer microseconds.
 * Never interchange source time and timeline time without an explicit mapping.
 */
export type Time = number;

export const ZERO: Time = 0;

export function isTime(value: unknown): value is Time {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function assertValidTime(time: Time): void {
  if (!isTime(time)) {
    throw new Error(`Time must be a non-negative safe integer, got ${String(time)}`);
  }
}
