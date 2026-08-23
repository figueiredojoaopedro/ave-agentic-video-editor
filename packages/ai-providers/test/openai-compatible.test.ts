import { describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleProvider } from '../src/openai-compatible.js';
import { ProviderError, ProviderHttpError } from '../src/errors.js';
import type { AIRequest } from '../src/types.js';

function mockFetchOnce(response: Partial<Response>): typeof fetch {
  return vi.fn().mockResolvedValue(response as Response) as unknown as typeof fetch;
}

describe('createOpenAiCompatibleProvider', () => {
  it('maps a request to chat/completions and parses a tool-call response', async () => {
    const fetchImpl = mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Calling splitClip',
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'splitClip', arguments: '{"clipId":"clip_1"}' } },
              ],
            },
          },
        ],
      }),
    });
    const provider = createOpenAiCompatibleProvider({ endpoint: 'https://api.example.com/v1/', apiKey: 'sk-test', fetchImpl });

    const request: AIRequest = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'split it' }],
      tools: [{ name: 'splitClip', description: 'Split a clip', parameters: { type: 'object', properties: {} } }],
    };
    const result = await provider.generate(request);

    expect(result.content).toBe('Calling splitClip');
    expect(result.toolCalls).toEqual([
      { id: 'call_1', name: 'splitClip', arguments: '{"clipId":"clip_1"}' },
    ]);

    const call = fetchImpl as ReturnType<typeof vi.fn>;
    const [url, init] = call.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer sk-test' });
    const body = JSON.parse(init.body as string) as { model: string; messages: Array<{ role: string }>; tools: unknown[] };
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0]!.role).toBe('user');
    expect(body.tools).toHaveLength(1);
  });

  it('throws ProviderHttpError on a 401', async () => {
    const fetchImpl = mockFetchOnce({ ok: false, status: 401, text: async () => 'unauthorized' });
    const provider = createOpenAiCompatibleProvider({ endpoint: 'https://api.example.com/v1', apiKey: 'sk-bad', fetchImpl });
    await expect(
      provider.generate({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it('throws ProviderError when the network fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const provider = createOpenAiCompatibleProvider({ endpoint: 'https://api.example.com/v1', apiKey: 'sk', fetchImpl });
    await expect(provider.generate({ model: 'm', messages: [] })).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError on invalid JSON', async () => {
    const fetchImpl = mockFetchOnce({ ok: true, status: 200, json: async () => 'not-an-object' });
    const provider = createOpenAiCompatibleProvider({ endpoint: 'https://api.example.com/v1', apiKey: 'sk', fetchImpl });
    await expect(provider.generate({ model: 'm', messages: [] })).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError (not TypeError) for a null first choice', async () => {
    const fetchImpl = mockFetchOnce({ ok: true, status: 200, json: async () => ({ choices: [null] }) });
    const provider = createOpenAiCompatibleProvider({ endpoint: 'https://api.example.com/v1', apiKey: 'sk', fetchImpl });
    await expect(provider.generate({ model: 'm', messages: [] })).rejects.toBeInstanceOf(ProviderError);
  });
});
