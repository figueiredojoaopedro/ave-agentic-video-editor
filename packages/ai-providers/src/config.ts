import { z } from 'zod';

export const AIModelConfigSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  endpoint: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  organizationId: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export type AIModelConfig = z.infer<typeof AIModelConfigSchema>;

export const PublicAIModelConfigSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  endpoint: z.string().url().optional(),
  organizationId: z.string().optional(),
  hasApiKey: z.boolean(),
});

export type PublicAIModelConfig = z.infer<typeof PublicAIModelConfigSchema>;

export function toPublicConfig(config: AIModelConfig): PublicAIModelConfig {
  const result: PublicAIModelConfig = {
    providerId: config.providerId,
    model: config.model,
    hasApiKey: config.apiKey !== undefined && config.apiKey.length > 0,
  };
  if (config.endpoint !== undefined) result.endpoint = config.endpoint;
  if (config.organizationId !== undefined) result.organizationId = config.organizationId;
  return result;
}
