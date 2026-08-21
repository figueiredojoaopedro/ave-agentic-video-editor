import { describe, expect, it } from 'vitest';
import { AIModelConfigSchema, toPublicConfig } from '../src/config.js';

describe('AIModelConfig', () => {
  it('parses a full config', () => {
    const result = AIModelConfigSchema.safeParse({
      providerId: 'openai-compatible',
      model: 'gpt-4o-mini',
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a config without a model', () => {
    expect(AIModelConfigSchema.safeParse({ providerId: 'openai-compatible' }).success).toBe(false);
  });

  it('toPublicConfig masks the api key', () => {
    const publicConfig = toPublicConfig({
      providerId: 'openai-compatible',
      model: 'gpt-4o-mini',
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-secret',
    });
    expect(publicConfig.hasApiKey).toBe(true);
    expect('apiKey' in publicConfig).toBe(false);
    expect(publicConfig.endpoint).toBe('https://api.openai.com/v1');
  });
});
