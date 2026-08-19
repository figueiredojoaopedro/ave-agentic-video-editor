import { describe, expect, it } from 'vitest';
import { createId } from '../src/ids.js';

describe('createId', () => {
  it('prepends the given prefix', () => {
    expect(createId('clip').startsWith('clip_')).toBe(true);
  });

  it('produces unique ids', () => {
    const a = createId('clip');
    const b = createId('clip');
    expect(a).not.toBe(b);
  });

  it('matches the id shape', () => {
    expect(createId('asset')).toMatch(/^asset_[a-z0-9_]+$/);
  });
});
