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
      renderResult: null,
      error: null,
      busy: false,
      info: null,
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

  it('render stores the render result', async () => {
    api.renderProject.mockResolvedValue({
      result: { outputPath: '/tmp/out.mp4', durationUs: 100_000, hasVideo: true, hasAudio: true },
    });
    useEditorStore.setState({ projectId: 'project_1' });
    await useEditorStore.getState().render();
    expect(useEditorStore.getState().renderResult?.hasVideo).toBe(true);
  });
});
