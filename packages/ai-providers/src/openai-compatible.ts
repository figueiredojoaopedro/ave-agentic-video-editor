import type { AIModelConfig } from './config.js';
import { ProviderError, ProviderHttpError } from './errors.js';
import type { AIProvider, AIRequest, AIResponse, AIToolCall, AIToolDefinition, AIMessage } from './types.js';
import type { AIProviderFactory } from './registry.js';

export interface OpenAiCompatibleOptions {
  endpoint: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): AIProvider {
  return {
    id: 'openai-compatible',
    name: 'OpenAI-compatible',
    async generate(request: AIRequest): Promise<AIResponse> {
      const endpoint = options.endpoint.replace(/\/+$/, '');
      const fetchImpl = options.fetchImpl ?? fetch;
      const timeoutMs = options.timeoutMs ?? 30_000;

      let response: Response;
      try {
        response = await fetchImpl(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages.map(toWireMessage),
            tools: request.tools?.map(toWireTool),
            temperature: request.temperature,
            max_tokens: request.maxTokens,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new ProviderError(`request to provider failed: ${toMessage(error)}`, error);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ProviderHttpError(response.status, body);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        throw new ProviderError('provider returned invalid JSON', error);
      }
      return parseWireResponse(data);
    },
  };
}

export const openAiCompatibleProviderFactory: AIProviderFactory = {
  create(config: AIModelConfig): AIProvider {
    if (!config.apiKey) throw new ProviderError('apiKey is required for openai-compatible provider');
    const endpoint = config.endpoint ?? 'https://api.openai.com/v1';
    return createOpenAiCompatibleProvider({ endpoint, apiKey: config.apiKey });
  },
};

function toWireMessage(message: AIMessage): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
    wire.tool_calls = message.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }));
  }
  if (message.toolCallId !== undefined) wire.tool_call_id = message.toolCallId;
  return wire;
}

function toWireTool(tool: AIToolDefinition): Record<string, unknown> {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

function parseWireResponse(data: unknown): AIResponse {
  if (typeof data !== 'object' || data === null) throw new ProviderError('invalid provider response shape');
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new ProviderError('provider response has no choices');
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) throw new ProviderError('provider response has no message');
  const wireMessage = message as { content?: unknown; tool_calls?: unknown };
  const content = typeof wireMessage.content === 'string' ? wireMessage.content : '';
  const toolCalls: AIToolCall[] = Array.isArray(wireMessage.tool_calls)
    ? wireMessage.tool_calls
        .map((raw): AIToolCall | null => {
          if (typeof raw !== 'object' || raw === null) return null;
          const call = raw as { id?: unknown; function?: unknown };
          const fn = call.function as { name?: unknown; arguments?: unknown } | undefined;
          if (typeof call.id !== 'string' || typeof fn?.name !== 'string' || typeof fn?.arguments !== 'string') {
            return null;
          }
          return { id: call.id, name: fn.name, arguments: fn.arguments };
        })
        .filter((call): call is AIToolCall => call !== null)
    : [];
  return { content, toolCalls };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
