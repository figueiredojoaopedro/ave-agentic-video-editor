import { describe, expect, it } from 'vitest';
import { MEDIA_VERSION } from '../src/index.js';

describe('media', () => {
  it('is loadable and reports a version', () => {
    expect(MEDIA_VERSION).toBe('0.1.0');
  });
});
