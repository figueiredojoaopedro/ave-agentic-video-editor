import type { AIModelConfig, AIProviderFactory, PublicAIModelConfig } from '@agentic-video-editor/ai-providers';
import { AIModelConfigSchema, openAiCompatibleProviderFactory, toPublicConfig } from '@agentic-video-editor/ai-providers';
import { ALL_TOOLS, runAgent, type AgentContext, type AgentResult } from '@agentic-video-editor/agent';
import type { SecretStore } from './secure-store.js';

const CONFIG_KEY = 'ai.config';
const API_KEY_KEY = 'ai.apiKey';

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}

export interface AIServiceOptions {
  secretStore: SecretStore;
  providerFactory?: AIProviderFactory;
}

export class AIService {
  private readonly secretStore: SecretStore;
  private readonly providerFactory: AIProviderFactory;

  constructor(options: AIServiceOptions) {
    this.secretStore = options.secretStore;
    this.providerFactory = options.providerFactory ?? openAiCompatibleProviderFactory;
  }

  async getConfig(): Promise<PublicAIModelConfig | null> {
    const raw = await this.secretStore.get(CONFIG_KEY);
    if (!raw) return null;
    const parsed = parseConfig(raw);
    if (!parsed) return null;
    const apiKey = await this.secretStore.get(API_KEY_KEY);
    return toPublicConfig(apiKey ? { ...parsed, apiKey } : parsed);
  }

  async saveConfig(config: AIModelConfig): Promise<PublicAIModelConfig> {
    const { apiKey, ...rest } = config;
    await this.secretStore.set(CONFIG_KEY, JSON.stringify(rest));
    if (apiKey !== undefined && apiKey.length > 0) {
      await this.secretStore.set(API_KEY_KEY, apiKey);
    }
    const storedKey = await this.secretStore.get(API_KEY_KEY);
    return toPublicConfig(storedKey ? { ...rest, apiKey: storedKey } : rest);
  }

  async chat(context: AgentContext, userMessage: string): Promise<AgentResult> {
    const raw = await this.secretStore.get(CONFIG_KEY);
    if (!raw) throw new AIConfigError('AI provider is not configured');
    const config = parseConfig(raw);
    if (!config) throw new AIConfigError('AI provider configuration is invalid');
    const apiKey = await this.secretStore.get(API_KEY_KEY);
    if (!apiKey) throw new AIConfigError('AI provider has no API key configured');
    const provider = this.providerFactory.create({ ...config, apiKey });
    return runAgent({ context, provider, model: config.model, tools: ALL_TOOLS, userMessage });
  }
}

function parseConfig(raw: string): AIModelConfig | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = AIModelConfigSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
