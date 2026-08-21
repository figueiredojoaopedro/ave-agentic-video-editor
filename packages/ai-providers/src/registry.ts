import type { AIModelConfig } from './config.js';
import { ProviderError } from './errors.js';
import type { AIProvider } from './types.js';

export interface AIProviderFactory {
  create(config: AIModelConfig): AIProvider;
}

export class ProviderRegistry {
  private readonly factories = new Map<string, AIProviderFactory>();

  register(providerId: string, factory: AIProviderFactory): void {
    this.factories.set(providerId, factory);
  }

  isRegistered(providerId: string): boolean {
    return this.factories.has(providerId);
  }

  listProviderIds(): string[] {
    return [...this.factories.keys()];
  }

  create(config: AIModelConfig): AIProvider {
    const factory = this.factories.get(config.providerId);
    if (!factory) {
      throw new ProviderError(`unknown provider id: ${config.providerId}`);
    }
    return factory.create(config);
  }
}
