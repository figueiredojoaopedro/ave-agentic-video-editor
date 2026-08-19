import { describe, expect, it } from 'vitest';
import { applyOperation } from '../src/operations/apply.js';
import type { EditOperation } from '../src/operations/types.js';
import { findClip, getTrack } from '../src/model/lookup.js';
import { makeTestProject } from './helpers.js';

describe('applyOperation', () => {
  it('addAsset inserts into the assets map without mutating the input', () => {
    const project = makeTestProject();
    const asset = { ...project.assets.asset_a!, id: 'asset_b', name: 'B.mp4', path: '/media/B.mp4' };
    const next = applyOperation(project, { type: 'addAsset', asset });
    expect(next.assets['asset_b']).toBeDefined();
    expect(project.assets['asset_b']).toBeUndefined();
  });

  it('addClip appends a clip to the target track and keeps clips sorted', () => {
    const project = makeTestProject();
    const source = project.timeline.tracks[0]!.clips[0]!;
    const clip = { ...source, id: 'clip_new', timelineStartUs: 50_000, timelineEndUs: 150_000 };
    const next = applyOperation(project, { type: 'addClip', trackId: 'track_v', clip });
    const clips = getTrack(next, 'track_v')!.clips;
    expect(clips.map((c) => c.id)).toEqual(['clip_1', 'clip_new']);
  });

  it('splitClip produces left and right segments with correct ranges', () => {
    const next = applyOperation(makeTestProject(), {
      type: 'splitClip',
      clipId: 'clip_1',
      atUs: 40_000,
      newClipId: 'clip_2',
    });
    const left = findClip(next, 'clip_1')!.clip;
    const right = findClip(next, 'clip_2')!.clip;
    expect(left.sourceEndUs).toBe(40_000);
    expect(left.timelineEndUs).toBe(40_000);
    expect(right.sourceStartUs).toBe(40_000);
    expect(right.timelineStartUs).toBe(40_000);
    expect(right.sourceEndUs).toBe(100_000);
    expect(right.timelineEndUs).toBe(100_000);
    expect(next.timeline.tracks[0]!.clips).toHaveLength(2);
  });

  it('trimClip keeps timelineStartUs and preserves duration equality', () => {
    const next = applyOperation(makeTestProject(), {
      type: 'trimClip',
      clipId: 'clip_1',
      sourceStartUs: 10_000,
      sourceEndUs: 40_000,
    });
    const clip = findClip(next, 'clip_1')!.clip;
    expect(clip.timelineStartUs).toBe(0);
    expect(clip.timelineEndUs).toBe(30_000);
    expect(clip.sourceEndUs - clip.sourceStartUs).toBe(clip.timelineEndUs - clip.timelineStartUs);
  });

  it('deleteClip removes the clip from its track', () => {
    const next = applyOperation(makeTestProject(), { type: 'deleteClip', clipId: 'clip_1' });
    expect(findClip(next, 'clip_1')).toBeUndefined();
    expect(next.timeline.tracks[0]!.clips).toHaveLength(0);
  });

  it('moveClip changes timelineStartUs and preserves duration', () => {
    const next = applyOperation(makeTestProject(), { type: 'moveClip', clipId: 'clip_1', timelineStartUs: 200_000 });
    const clip = findClip(next, 'clip_1')!.clip;
    expect(clip.timelineStartUs).toBe(200_000);
    expect(clip.timelineEndUs).toBe(300_000);
  });

  it('duplicateClip places a copy immediately after the original', () => {
    const next = applyOperation(makeTestProject(), { type: 'duplicateClip', clipId: 'clip_1', newClipId: 'clip_copy' });
    const copy = findClip(next, 'clip_copy')!.clip;
    expect(copy.assetId).toBe('asset_a');
    expect(copy.timelineStartUs).toBe(100_000);
    expect(copy.timelineEndUs).toBe(200_000);
  });

  it('muteClip and setVolume update fields immutably', () => {
    const muted = applyOperation(makeTestProject(), { type: 'muteClip', clipId: 'clip_1', muted: true });
    expect(findClip(muted, 'clip_1')!.clip.muted).toBe(true);
    const volume = applyOperation(makeTestProject(), { type: 'setVolume', clipId: 'clip_1', volume: 0.4 });
    expect(findClip(volume, 'clip_1')!.clip.volume).toBe(0.4);
  });

  it('throws InvariantError when applied to invalid input', () => {
    expect(() => applyOperation(makeTestProject(), { type: 'deleteClip', clipId: 'missing' })).toThrow(/invariant/i);
  });
});
