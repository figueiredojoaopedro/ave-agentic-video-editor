import { describe, expect, it } from 'vitest';
import { FFMPEG_VERSION } from '../src/index.js';

describe('ffmpeg', () => {
  it('is loadable and reports a version', () => {
    expect(FFMPEG_VERSION).toBe('0.1.0');
  });
});
