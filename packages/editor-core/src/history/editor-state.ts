import type { Project, Track } from '../model/index.js';
import type { EditOperation } from '../operations/index.js';
import { applyOperation } from '../operations/apply.js';
import { createId } from '../ids.js';

export interface EditorState {
  base: Project;
  past: EditOperation[];
  future: EditOperation[];
}

export function createEditorState(base: Project): EditorState {
  return { base, past: [], future: [] };
}

export function createEmptyProject(name: string): Project {
  const now = new Date().toISOString();
  const videoTrack: Track = { id: createId('track'), kind: 'video', name: 'Video 1', clips: [] };
  const audioTrack: Track = { id: createId('track'), kind: 'audio', name: 'Audio 1', clips: [] };
  return {
    schemaVersion: 1,
    id: createId('project'),
    name,
    createdAt: now,
    updatedAt: now,
    assets: {},
    timeline: { id: createId('timeline'), tracks: [videoTrack, audioTrack] },
    metadata: {},
  };
}

/** Replay the recorded operations over the base snapshot to derive current state. */
export function getProject(state: EditorState): Project {
  return state.past.reduce<Project>((acc, op) => applyOperation(acc, op), state.base);
}

/** Append a validated operation to the log, clearing the redo stack. */
export function appendOperation(state: EditorState, operation: EditOperation): EditorState {
  return { base: state.base, past: [...state.past, operation], future: [] };
}

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}

export function undo(state: EditorState): EditorState {
  if (state.past.length === 0) return state;
  const last = state.past[state.past.length - 1]!;
  return { base: state.base, past: state.past.slice(0, -1), future: [last, ...state.future] };
}

export function redo(state: EditorState): EditorState {
  if (state.future.length === 0) return state;
  const [next, ...rest] = state.future;
  return { base: state.base, past: [...state.past, next!], future: rest };
}
