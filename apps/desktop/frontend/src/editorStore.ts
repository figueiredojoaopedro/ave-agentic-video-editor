import { create } from 'zustand';
import { createId, type EditOperation, type Project } from '@agentic-video-editor/editor-core';
import { api, type RenderResult } from './api';

export interface EditorStore {
  projectId: string | null;
  project: Project | null;
  playheadUs: number;
  selectedClipId: string | null;
  renderResult: RenderResult | null;
  error: string | null;
  busy: boolean;
  info: string | null;

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
  selectClip: (clipId: string | null) => void;
  setPlayhead: (us: number) => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  projectId: null,
  project: null,
  playheadUs: 0,
  selectedClipId: null,
  renderResult: null,
  error: null,
  busy: false,
  info: null,

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
    set({ busy: true, error: null, renderResult: null });
    try {
      const { result } = await api.renderProject(projectId);
      set({ renderResult: result, info: `Render complete: ${result.outputPath}` });
    } catch (error) {
      set({ error: toMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  selectClip: (clipId) => set({ selectedClipId: clipId }),
  setPlayhead: (us) => set({ playheadUs: us }),
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
