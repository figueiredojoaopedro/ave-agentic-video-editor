import { create } from 'zustand';
import { createId, type EditOperation, type Project } from '@agentic-video-editor/editor-core';
import { api, type PublicAIModelConfig, type RenderResult } from './api';

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(jobId: string): void {
  stopPolling();
  const tick = async () => {
    try {
      const { job } = await api.getRenderJob(jobId);
      const terminal = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';
      useEditorStore.setState({
        renderStatus: job.status,
        renderProgress: job.progress,
        renderResult: job.result ?? null,
        renderJobId: terminal ? null : jobId,
      });
      if (job.status === 'completed') {
        stopPolling();
        useEditorStore.setState({ info: `Render complete: ${job.result?.outputPath ?? ''}` });
      } else if (job.status === 'failed') {
        stopPolling();
        useEditorStore.setState({ error: job.error ?? 'render failed' });
      } else if (job.status === 'cancelled') {
        stopPolling();
        useEditorStore.setState({ info: 'Render cancelled' });
      }
    } catch (error) {
      stopPolling();
      useEditorStore.setState({ error: toMessage(error) });
    }
  };
  void tick();
  pollTimer = setInterval(tick, 500);
}

export interface EditorStore {
  projectId: string | null;
  project: Project | null;
  playheadUs: number;
  selectedClipId: string | null;
  renderJobId: string | null;
  renderStatus: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  renderProgress: number;
  renderResult: RenderResult | null;
  error: string | null;
  busy: boolean;
  info: string | null;
  aiConfig: PublicAIModelConfig | null;
  aiMessages: Array<{ role: 'user' | 'assistant'; content: string }>;

  createProject: (name: string) => Promise<void>;
  importAsset: (path: string) => Promise<void>;
  applyOp: (operation: EditOperation) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  splitSelected: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  nudgeSelected: (deltaUs: number) => Promise<void>;
  saveProject: () => Promise<void>;
  loadProject: (path: string) => Promise<void>;
  render: () => Promise<void>;
  cancelRender: () => Promise<void>;
  selectClip: (clipId: string | null) => void;
  setPlayhead: (us: number) => void;

  loadAiConfig: () => Promise<void>;
  saveAiConfig: (config: {
    providerId: string;
    model: string;
    endpoint?: string;
    apiKey?: string;
  }) => Promise<void>;
  sendAiMessage: (message: string) => Promise<void>;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
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

  createProject: async (name) => {
    set({ busy: true, error: null, info: null });
    try {
      const { id, project } = await api.createProject(name);
      set({ projectId: id, project, selectedClipId: null, playheadUs: 0, renderResult: null });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  importAsset: async (path) => {
    set({ busy: true, error: null });
    try {
      const { project } = await api.importAsset(path);
      set({ project });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  applyOp: async (operation) => {
    const { projectId } = get();
    if (!projectId) return;
    set({ busy: true, error: null });
    try {
      const { project } = await api.applyOperation(projectId, operation);
      set({ project });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  undo: async () => {
    const { projectId } = get();
    if (!projectId) return;
    set({ busy: true, error: null });
    try {
      const { project } = await api.undo(projectId);
      set({ project });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  redo: async () => {
    const { projectId } = get();
    if (!projectId) return;
    set({ busy: true, error: null });
    try {
      const { project } = await api.redo(projectId);
      set({ project });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  splitSelected: async () => {
    const { project, selectedClipId, playheadUs, applyOp } = get();
    if (!project || !selectedClipId) return;
    const clip = findClip(project, selectedClipId);
    if (!clip || playheadUs <= clip.timelineStartUs || playheadUs >= clip.timelineEndUs) return;
    await applyOp({
      type: 'splitClip',
      clipId: selectedClipId,
      atUs: playheadUs,
      newClipId: createId('clip'),
    });
  },

  deleteSelected: async () => {
    const { selectedClipId, applyOp } = get();
    if (!selectedClipId) return;
    await applyOp({ type: 'deleteClip', clipId: selectedClipId });
    set({ selectedClipId: null });
  },

  nudgeSelected: async (deltaUs) => {
    const { project, selectedClipId, applyOp } = get();
    if (!project || !selectedClipId) return;
    const clip = findClip(project, selectedClipId);
    if (!clip) return;
    const next = Math.max(0, clip.timelineStartUs + deltaUs);
    await applyOp({ type: 'moveClip', clipId: selectedClipId, timelineStartUs: next });
  },

  saveProject: async () => {
    const { projectId } = get();
    if (!projectId) return;
    set({ busy: true, error: null, info: null });
    try {
      const { path } = await api.saveProject(projectId);
      set({ info: `Saved to ${path}` });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  loadProject: async (path) => {
    set({ busy: true, error: null, info: null });
    try {
      const { id, project } = await api.loadProject(path);
      set({ projectId: id, project, selectedClipId: null, playheadUs: 0, renderResult: null, info: `Loaded ${path}` });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  render: async () => {
    const { projectId } = get();
    if (!projectId) return;
    stopPolling();
    set({ busy: true, error: null, renderJobId: null, renderStatus: 'pending', renderProgress: 0, renderResult: null });
    try {
      const { jobId } = await api.renderProject(projectId);
      set({ renderJobId: jobId, renderStatus: 'pending' });
      startPolling(jobId);
    } catch (error) {
      set({ error: toMessage(error), renderStatus: 'failed' });
    } finally {
      set({ busy: false });
    }
  },

  cancelRender: async () => {
    const { renderJobId } = get();
    if (!renderJobId) return;
    try {
      await api.cancelRenderJob(renderJobId);
      stopPolling();
      set({ renderStatus: 'cancelled', renderJobId: null });
    } catch (error) {
      set({ error: toMessage(error) });
    }
  },

  selectClip: (clipId) => set({ selectedClipId: clipId }),
  setPlayhead: (us) => set({ playheadUs: us }),

  loadAiConfig: async () => {
    set({ busy: true, error: null });
    try {
      const { config } = await api.getAiConfig();
      set({ aiConfig: config });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  saveAiConfig: async (config) => {
    set({ busy: true, error: null });
    try {
      const result = await api.saveAiConfig(config);
      set({ aiConfig: result.config, info: 'AI configuration saved' });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  sendAiMessage: async (message) => {
    const { projectId, aiMessages } = get();
    if (!projectId) return;
    const updated = [...aiMessages, { role: 'user' as const, content: message }];
    set({ aiMessages: updated, busy: true, error: null });
    try {
      const result = await api.aiChat(projectId, message);
      set({
        aiMessages: [...updated, { role: 'assistant', content: result.response }],
        project: result.project,
        info:
          result.appliedOperations.length > 0
            ? `AI applied: ${result.appliedOperations.join(', ')}`
            : 'AI made no edits',
      });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },
}));

function findClip(project: Project, clipId: string) {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return clip;
  }
  return undefined;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
