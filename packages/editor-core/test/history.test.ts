import { describe, expect, it } from 'vitest';
import {
  appendOperation,
  canRedo,
  canUndo,
  createEmptyProject,
  createEditorState,
  getProject,
  redo,
  undo,
} from '../src/history/editor-state.js';
import { makeTestProject } from './helpers.js';

describe('editor state history', () => {
  it('getProject returns the base when no operations were recorded', () => {
    const base = makeTestProject();
    const state = createEditorState(base);
    expect(getProject(state)).toEqual(base);
  });

  it('getProject folds recorded operations over the base', () => {
    let state = createEditorState(makeTestProject());
    state = appendOperation(state, { type: 'muteClip', clipId: 'clip_1', muted: true });
    expect(getProject(state).timeline.tracks[0]!.clips[0]!.muted).toBe(true);
  });

  it('appendOperation clears the future stack', () => {
    let state = createEditorState(makeTestProject());
    state = appendOperation(state, { type: 'muteClip', clipId: 'clip_1', muted: true });
    state = undo(state);
    expect(canRedo(state)).toBe(true);
    state = appendOperation(state, { type: 'muteClip', clipId: 'clip_1', muted: false });
    expect(canRedo(state)).toBe(false);
  });

  it('undo then redo restores the identical project state', () => {
    let state = createEditorState(makeTestProject());
    state = appendOperation(state, { type: 'muteClip', clipId: 'clip_1', muted: true });
    state = appendOperation(state, { type: 'setVolume', clipId: 'clip_1', volume: 0.2 });
    const before = getProject(state);
    const undone = undo(state);
    const redone = redo(undone);
    expect(getProject(redone)).toEqual(before);
  });

  it('apply then undo restores the previous state (spec invariant)', () => {
    let state = createEditorState(makeTestProject());
    const original = getProject(state);
    state = appendOperation(state, { type: 'splitClip', clipId: 'clip_1', atUs: 40_000, newClipId: 'clip_2' });
    const split = getProject(state);
    expect(split.timeline.tracks[0]!.clips).toHaveLength(2);
    state = undo(state);
    expect(getProject(state)).toEqual(original);
  });

  it('undo is a no-op at the base and redo is a no-op at the tip', () => {
    let state = createEditorState(makeTestProject());
    expect(canUndo(state)).toBe(false);
    expect(undo(state)).toEqual(state);
    state = appendOperation(state, { type: 'muteClip', clipId: 'clip_1', muted: true });
    expect(canRedo(state)).toBe(false);
    expect(redo(state)).toEqual(state);
  });

  it('multiple undos walk back through the operation log', () => {
    let state = createEditorState(makeTestProject());
    state = appendOperation(state, { type: 'muteClip', clipId: 'clip_1', muted: true });
    state = appendOperation(state, { type: 'setVolume', clipId: 'clip_1', volume: 0.3 });
    const base = getProject(createEditorState(makeTestProject()));
    state = undo(state);
    expect(getProject(state).timeline.tracks[0]!.clips[0]!.muted).toBe(true);
    state = undo(state);
    expect(getProject(state)).toEqual(base);
  });

  it('createEmptyProject has one video and one audio track and no clips', () => {
    const project = createEmptyProject('New Project');
    expect(project.name).toBe('New Project');
    expect(project.timeline.tracks.map((t) => t.kind)).toEqual(['video', 'audio']);
    expect(project.timeline.tracks.every((t) => t.clips.length === 0)).toBe(true);
  });
});
