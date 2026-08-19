import { describe, expect, it } from 'vitest';
import {
  applyOperation,
  canRedo,
  canUndo,
  createProject,
  getProject,
  loadProject,
  redo,
  saveProject,
  undo,
} from '../src/editor/editor.js';
import { deserializeProject, serializeProject } from '../src/serialization/project-json.js';
import type { EditOperation } from '../src/operations/index.js';
import { makeTestProject } from './helpers.js';

describe('editor facade integration', () => {
  it('creates a project and applies a realistic edit sequence', () => {
    let state = createProject('My Project');
    const project = getProject(state);
    const trackId = project.timeline.tracks[0]!.id;
    const audioTrackId = project.timeline.tracks[1]!.id;

    const asset = { ...makeTestProject().assets.asset_a! };
    let result = applyOperation(state, { type: 'addAsset', asset });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('addAsset failed');
    state = result.state!;

    result = applyOperation(state, {
      type: 'addClip',
      trackId,
      clip: {
        id: 'clip_1',
        assetId: asset.id,
        name: 'A',
        sourceStartUs: 0,
        sourceEndUs: 100_000,
        timelineStartUs: 0,
        timelineEndUs: 100_000,
        muted: false,
        volume: 1,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('addClip failed');
    state = result.state!;

    state = applyOperation(state, { type: 'splitClip', clipId: 'clip_1', atUs: 40_000, newClipId: 'clip_2' }).state!;
    state = applyOperation(state, { type: 'deleteClip', clipId: 'clip_2' }).state!;
    state = applyOperation(state, { type: 'moveClip', clipId: 'clip_1', timelineStartUs: 500_000 }).state!;
    state = applyOperation(state, { type: 'duplicateClip', clipId: 'clip_1', newClipId: 'clip_dup' }).state!;
    state = applyOperation(state, { type: 'muteClip', clipId: 'clip_1', muted: true }).state!;
    state = applyOperation(state, { type: 'setVolume', clipId: 'clip_dup', volume: 0.5 }).state!;

    const finalProject = getProject(state);
    expect(finalProject.timeline.tracks[0]!.clips.map((c) => c.id)).toEqual(['clip_1', 'clip_dup']);
    expect(findClipById(finalProject, 'clip_1')!.muted).toBe(true);
    expect(findClipById(finalProject, 'clip_dup')!.volume).toBe(0.5);

    function findClipById(p: typeof finalProject, id: string) {
      for (const track of p.timeline.tracks) {
        const clip = track.clips.find((c) => c.id === id);
        if (clip) return clip;
      }
      return undefined;
    }
  });

  it('applies the spec invariant apply->undo for the whole sequence', () => {
    let state = createProject('Seq');
    const project = getProject(state);
    const trackId = project.timeline.tracks[0]!.id;
    const asset = { ...makeTestProject().assets.asset_a! };
    state = applyOperation(state, { type: 'addAsset', asset }).state!;
    state = applyOperation(state, {
      type: 'addClip',
      trackId,
      clip: {
        id: 'clip_1',
        assetId: asset.id,
        name: 'A',
        sourceStartUs: 0,
        sourceEndUs: 100_000,
        timelineStartUs: 0,
        timelineEndUs: 100_000,
        muted: false,
        volume: 1,
      },
    }).state!;
    state = applyOperation(state, { type: 'splitClip', clipId: 'clip_1', atUs: 40_000, newClipId: 'clip_2' }).state!;
    state = applyOperation(state, { type: 'deleteClip', clipId: 'clip_2' }).state!;

    expect(canUndo(state)).toBe(true);
    while (canUndo(state)) {
      state = undo(state);
    }
    expect(getProject(state).assets).toEqual({});
    expect(getProject(state).timeline.tracks.every((t) => t.clips.length === 0)).toBe(true);
  });

  it('serialize -> deserialize -> loadProject reproduces the saved project', () => {
    let state = createProject('Save Me');
    const project = getProject(state);
    const trackId = project.timeline.tracks[0]!.id;
    const asset = { ...makeTestProject().assets.asset_a! };
    state = applyOperation(state, { type: 'addAsset', asset }).state!;
    state = applyOperation(state, {
      type: 'addClip',
      trackId,
      clip: {
        id: 'clip_1',
        assetId: asset.id,
        name: 'A',
        sourceStartUs: 0,
        sourceEndUs: 100_000,
        timelineStartUs: 0,
        timelineEndUs: 100_000,
        muted: false,
        volume: 1,
      },
    }).state!;
    const saved = serializeProject(saveProject(state));
    const loaded = deserializeProject(saved);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('deserialize failed');
    const restoredState = loadProject(loaded.project);
    expect(getProject(restoredState)).toEqual(saveProject(state));
  });

  it('rejects invalid operations and leaves state untouched', () => {
    const state = createProject('R');
    const result = applyOperation(state, { type: 'deleteClip', clipId: 'missing' } as EditOperation);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.code).toBe('CLIP_NOT_FOUND');
    expect(getProject(state).timeline.tracks.every((t) => t.clips.length === 0)).toBe(true);
  });

  it('rejects malformed operations at the schema boundary and leaves state untouched', () => {
    const state = createProject('R');
    const before = getProject(state);
    const malformed = { type: 'splitClip', clipId: 'clip_1', atUs: 'banana', newClipId: 'clip_x' } as unknown as EditOperation;
    const result = applyOperation(state, malformed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.code).toBe('INVALID_OPERATION');
      expect(result.errors[0]!.message).toContain('atUs');
    }
    expect(getProject(state)).toEqual(before);

    const unknownType = applyOperation(state, { type: 'nope' } as unknown as EditOperation);
    expect(unknownType.ok).toBe(false);
    expect(getProject(state)).toEqual(before);
  });

  it('redo re-applies undone operations', () => {
    let state = createProject('R');
    const project = getProject(state);
    const trackId = project.timeline.tracks[0]!.id;
    const asset = { ...makeTestProject().assets.asset_a! };
    state = applyOperation(state, { type: 'addAsset', asset }).state!;
    state = undo(state);
    expect(canRedo(state)).toBe(true);
    state = redo(state);
    expect(getProject(state).assets[asset.id]).toBeDefined();
  });
});
