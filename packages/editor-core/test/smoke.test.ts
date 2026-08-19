import { describe, expect, it } from 'vitest';
import { EDITOR_CORE_VERSION } from '../src/index.js';

describe('editor-core', () => {
  it('is loadable and reports a version', () => {
    expect(EDITOR_CORE_VERSION).toBe('0.1.0');
  });
});
