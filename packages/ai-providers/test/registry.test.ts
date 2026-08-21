import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '../src/registry.js';
import { ProviderError } from '../src/errors.js';
import type { AIProvider, AIResponse } from '../src/types.js';

describe('ProviderRegistry', () => {
  it('registers and creates a provider from a factory', () => {
    const registry = new ProviderRegistry();
    const provider: AIProvider = {
      id: 'fake',
      name: 'Fake',
      generate: async (): Promise<AIResponse> => ({ content: 'hi', toolCalls: [] }),
    };
    registry.register('fake', { create: () => provider });
    expect(registry.isRegistered('fake')).toBe(true);
    expect(registry.listProviderIds()).toContain('fake');
    expect(registry.create({ providerId: 'fake', model: 'm' })).toBe(provider);
  });

  it('throws ProviderError for an unknown provider', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.create({ providerId: 'nope', model: 'm' })).toThrow(ProviderError);
  });
});
