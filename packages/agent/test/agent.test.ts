import { describe, expect, it } from 'vitest';
import type { AIMessage, AIProvider, AIRequest, AIResponse } from '@agentic-video-editor/ai-providers';
import type { EditOperation, Project } from '@agentic-video-editor/editor-core';
import { runAgent } from '../src/agent.js';
import { ALL_TOOLS } from '../src/tools.js';
import type { AgentContext } from '../src/context.js';

function makeProject(): Project {
  return {
    schemaVersion: 1,
    id: 'project_1',
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: { asset_a: { id: 'asset_a', name: 'A.mp4', path: '/media/A.mp4', kind: 'video', durationUs: 1_000_000, metadata: {} } },
    timeline: {
      id: 'timeline_1',
      tracks: [
        {
          id: 'track_v',
          kind: 'video',
          name: 'V1',
          clips: [
            {
              id: 'clip_1',
              assetId: 'asset_a',
              name: 'A',
              sourceStartUs: 0,
              sourceEndUs: 1_000_000,
              timelineStartUs: 0,
              timelineEndUs: 1_000_000,
              muted: false,
              volume: 1,
            },
          ],
        },
        { id: 'track_a', kind: 'audio', name: 'A1', clips: [] },
      ],
    },
    metadata: {},
  };
}

function makeContext() {
  let project = makeProject();
  const applied: EditOperation[] = [];
  const context: AgentContext = {
    getProject: () => project,
    applyOperation: (operation) => {
      const isSplit = operation.type === 'splitClip' && operation.clipId === 'clip_1' && operation.atUs === 400_000;
      if (!isSplit) return { ok: false, errors: [{ code: 'REJECTED', message: 'not allowed in test' }] };
      const clip = project.timeline.tracks[0]!.clips[0]!;
      const left = { ...clip, sourceEndUs: 400_000, timelineEndUs: 400_000 };
      const right = { ...clip, id: operation.newClipId, sourceStartUs: 400_000, timelineStartUs: 400_000 };
      project = {
        ...project,
        timeline: {
          ...project.timeline,
          tracks: project.timeline.tracks.map((track, index) =>
            index === 0 ? { ...track, clips: [left, right] } : track,
          ),
        },
      };
      applied.push(operation);
      return { ok: true, project };
    },
    undo: () => {
      const op = applied.pop();
      if (!op) return undefined;
      project = makeProject();
      return project;
    },
    redo: () => undefined,
  };
  return { context, applied };
}

function scriptedProvider(script: Array<AIResponse | ((messages: AIMessage[]) => AIResponse)>): AIProvider {
  let calls = 0;
  return {
    id: 'fake',
    name: 'Fake',
    async generate(request: AIRequest): Promise<AIResponse> {
      const step = script[Math.min(calls, script.length - 1)]!;
      calls += 1;
      if (typeof step === 'function') return step(request.messages);
      return step;
    },
  };
}

describe('runAgent', () => {
  it('executes a splitClip tool call through the context and records the applied operation', async () => {
    const { context, applied } = makeContext();
    const provider = scriptedProvider([
      {
        content: 'Splitting.',
        toolCalls: [
          { id: 'call_1', name: 'splitClip', arguments: '{"clipId":"clip_1","atUs":400000}' },
        ],
      },
      { content: 'Done. Split at 400ms.', toolCalls: [] },
    ]);

    const result = await runAgent({ context, provider, model: 'fake-model', tools: ALL_TOOLS, userMessage: 'Split the first clip at 400ms' });

    expect(applied).toHaveLength(1);
    expect(applied[0]!.type).toBe('splitClip');
    expect((applied[0] as { atUs: number }).atUs).toBe(400_000);
    expect((applied[0] as { newClipId: string }).newClipId).toMatch(/^clip_/);
    expect(result.appliedOperations).toEqual(['splitClip']);
    expect(result.project.timeline.tracks[0]!.clips).toHaveLength(2);
    expect(result.response).toBe('Done. Split at 400ms.');
  });

  it('returns the final content when the provider makes no tool calls', async () => {
    const { context } = makeContext();
    const provider = scriptedProvider([{ content: 'Nothing to do.', toolCalls: [] }]);
    const result = await runAgent({ context, provider, model: 'm', tools: ALL_TOOLS, userMessage: 'hello' });
    expect(result.response).toBe('Nothing to do.');
    expect(result.appliedOperations).toEqual([]);
  });

  it('reports invalid tool arguments to the model as a tool result', async () => {
    const { context } = makeContext();
    const provider = scriptedProvider([
      { content: 'trying', toolCalls: [{ id: 'call_1', name: 'splitClip', arguments: '{"clipId":"clip_1"}' }] },
      { content: 'ok', toolCalls: [] },
    ]);
    const result = await runAgent({ context, provider, model: 'm', tools: ALL_TOOLS, userMessage: 'split' });
    expect(result.appliedOperations).toEqual([]);
    expect(result.response).toBe('ok');
  });

  it('reports an unknown tool name as an error tool result', async () => {
    const { context } = makeContext();
    const provider = scriptedProvider([
      { content: 'x', toolCalls: [{ id: 'call_1', name: 'nope', arguments: '{}' }] },
      { content: 'done', toolCalls: [] },
    ]);
    const result = await runAgent({ context, provider, model: 'm', tools: ALL_TOOLS, userMessage: 'go' });
    expect(result.response).toBe('done');
  });

  it('stops after maxIterations when the model keeps calling tools', async () => {
    const { context } = makeContext();
    const provider = scriptedProvider([
      { content: 'again', toolCalls: [{ id: 'call_1', name: 'getProject', arguments: '{}' }] },
    ]);
    const result = await runAgent({ context, provider, model: 'm', tools: ALL_TOOLS, userMessage: 'loop', maxIterations: 2 });
    expect(result.response).toContain('maximum number of tool iterations');
  });

  it('read-only tools do not record applied operations', async () => {
    const { context } = makeContext();
    const provider = scriptedProvider([
      { content: '', toolCalls: [{ id: 'call_1', name: 'getProject', arguments: '{}' }] },
      { content: 'done', toolCalls: [] },
    ]);
    const result = await runAgent({ context, provider, model: 'm', tools: ALL_TOOLS, userMessage: 'whats up' });
    expect(result.appliedOperations).toEqual([]);
    expect(result.response).toBe('done');
  });
});
