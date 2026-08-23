import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@agentic-video-editor/editor-core';
import { useEditorStore } from '../src/editorStore';

const api = vi.hoisted(() => ({
  createProject: vi.fn(),
  applyOperation: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  importAsset: vi.fn(),
  saveProject: vi.fn(),
  loadProject: vi.fn(),
  renderProject: vi.fn(),
  getRenderJob: vi.fn(),
  cancelRenderJob: vi.fn(),
  getAiConfig: vi.fn(),
  saveAiConfig: vi.fn(),
  aiChat: vi.fn(),
}));

vi.mock('../src/api', () => ({ api }));

function makeProject(): Project {
  return {
    schemaVersion: 1 as const,
    id: 'project_1',
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: {},
    timeline: {
      id: 'timeline_1',
      tracks: [
        { id: 'track_v', kind: 'video' as const, name: 'V1', clips: [] },
        { id: 'track_a', kind: 'audio' as const, name: 'A1', clips: [] },
      ],
    },
    metadata: {},
  };
}

describe('editorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({
      projectId: null,
      project: null,
      playheadUs: 0,
      selectedClipId: null,
      renderJobId: null,
      renderStatus: 'idle',
      renderProgress: 0,
      renderResult: null,
      error: null,
      busy: false,
      info: null,
      aiConfig: null,
      aiMessages: [],
    });
  });

  it('createProject stores the returned project', async () => {
    const project = makeProject();
    api.createProject.mockResolvedValue({ id: project.id, project });
    await useEditorStore.getState().createProject('Test');
    expect(useEditorStore.getState().projectId).toBe('project_1');
    expect(useEditorStore.getState().project).toEqual(project);
  });

  it('applyOp records an error when the operation fails', async () => {
    api.applyOperation.mockRejectedValue(new Error('CLIP_NOT_FOUND: clip not found'));
    useEditorStore.setState({ projectId: 'project_1', project: makeProject() });
    await useEditorStore.getState().applyOp({ type: 'deleteClip', clipId: 'nope' });
    expect(useEditorStore.getState().error).toContain('CLIP_NOT_FOUND');
  });

  it('splitSelected requires a selected clip and an interior playhead', async () => {
    const project = makeProject();
    project.timeline.tracks[0]!.clips = [{
      id: 'clip_1', assetId: 'a', name: 'A',
      sourceStartUs: 0, sourceEndUs: 100_000, timelineStartUs: 0, timelineEndUs: 100_000,
      muted: false, volume: 1,
    }];
    useEditorStore.setState({ projectId: 'project_1', project, selectedClipId: 'clip_1', playheadUs: 40_000 });
    await useEditorStore.getState().splitSelected();
    expect(api.applyOperation).toHaveBeenCalledTimes(1);
    expect(api.applyOperation.mock.calls[0]![1]).toMatchObject({ type: 'splitClip', clipId: 'clip_1', atUs: 40_000 });
  });

  it('splitSelected is a no-op outside the clip interior', async () => {
    const project = makeProject();
    project.timeline.tracks[0]!.clips = [{
      id: 'clip_1', assetId: 'a', name: 'A',
      sourceStartUs: 0, sourceEndUs: 100_000, timelineStartUs: 0, timelineEndUs: 100_000,
      muted: false, volume: 1,
    }];
    useEditorStore.setState({ projectId: 'project_1', project, selectedClipId: 'clip_1', playheadUs: 0 });
    await useEditorStore.getState().splitSelected();
    expect(api.applyOperation).not.toHaveBeenCalled();
  });

  it('render stores the render result after the job completes', async () => {
    api.renderProject.mockResolvedValue({ jobId: 'job_1' });
    api.getRenderJob.mockResolvedValue({
      job: {
        id: 'job_1',
        status: 'completed',
        progress: 1,
        manifestHash: 'hash',
        result: { outputPath: '/tmp/out.mp4', durationUs: 100_000, hasVideo: true, hasAudio: true },
      },
    });
    useEditorStore.setState({ projectId: 'project_1' });
    await useEditorStore.getState().render();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useEditorStore.getState().renderResult?.hasVideo).toBe(true);
  });

  it('render enqueues a job and starts polling', async () => {
    api.renderProject.mockResolvedValue({ jobId: 'job_1' });
    api.getRenderJob.mockResolvedValue({
      job: { id: 'job_1', status: 'running', progress: 0.5, manifestHash: 'hash' },
    });
    useEditorStore.setState({ projectId: 'project_1' });
    await useEditorStore.getState().render();
    expect(api.renderProject).toHaveBeenCalledWith('project_1');
    expect(useEditorStore.getState().renderJobId).toBe('job_1');
    expect(useEditorStore.getState().renderStatus).toBe('running');
    expect(useEditorStore.getState().renderProgress).toBe(0.5);
  });

  it('cancelRender cancels a running job', async () => {
    api.renderProject.mockResolvedValue({ jobId: 'job_1' });
    api.getRenderJob.mockResolvedValue({
      job: { id: 'job_1', status: 'running', progress: 0.5, manifestHash: 'hash' },
    });
    api.cancelRenderJob.mockResolvedValue({ cancelled: true });
    useEditorStore.setState({ projectId: 'project_1' });
    await useEditorStore.getState().render();
    await useEditorStore.getState().cancelRender();
    expect(api.cancelRenderJob).toHaveBeenCalledWith('job_1');
    expect(useEditorStore.getState().renderStatus).toBe('cancelled');
  });

  it('cancelRender leaves status intact when the cancel call fails', async () => {
    api.renderProject.mockResolvedValue({ jobId: 'job_1' });
    api.getRenderJob.mockResolvedValue({
      job: { id: 'job_1', status: 'running', progress: 0.5, manifestHash: 'hash' },
    });
    api.cancelRenderJob.mockRejectedValue(new Error('cancel failed'));
    useEditorStore.setState({ projectId: 'project_1' });
    await useEditorStore.getState().render();
    await useEditorStore.getState().cancelRender();
    expect(useEditorStore.getState().error).toContain('cancel failed');
    expect(useEditorStore.getState().renderStatus).toBe('running');
    expect(useEditorStore.getState().renderJobId).toBe('job_1');
  });

  it('loadAiConfig stores the fetched config', async () => {
    api.getAiConfig.mockResolvedValue({
      config: { providerId: 'openai-compatible', model: 'gpt-4o-mini', hasApiKey: true },
    });
    await useEditorStore.getState().loadAiConfig();
    expect(useEditorStore.getState().aiConfig?.model).toBe('gpt-4o-mini');
  });

  it('sendAiMessage calls the chat API and updates project + messages', async () => {
    const project = makeProject();
    api.aiChat.mockResolvedValue({
      response: 'Done.',
      appliedOperations: ['splitClip'],
      project,
    });
    useEditorStore.setState({ projectId: 'project_1', project });
    await useEditorStore.getState().sendAiMessage('Split it');
    const state = useEditorStore.getState();
    expect(api.aiChat).toHaveBeenCalledWith('project_1', 'Split it');
    expect(state.aiMessages).toEqual([
      { role: 'user', content: 'Split it' },
      { role: 'assistant', content: 'Done.' },
    ]);
    expect(state.info).toContain('splitClip');
  });

  it('sendAiMessage records an error when the chat fails', async () => {
    api.aiChat.mockRejectedValue(new Error('AI_NOT_CONFIGURED: no provider'));
    useEditorStore.setState({ projectId: 'project_1', project: makeProject() });
    await useEditorStore.getState().sendAiMessage('hi');
    expect(useEditorStore.getState().error).toContain('AI_NOT_CONFIGURED');
  });
});
