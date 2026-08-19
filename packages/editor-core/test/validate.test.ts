import { describe, expect, it } from 'vitest';
import { validateOperation } from '../src/operations/validate.js';
import type { EditOperation } from '../src/operations/types.js';
import { makeTestProject } from './helpers.js';

function ok(op: EditOperation) {
  return validateOperation(makeTestProject(), op);
}

describe('validateOperation', () => {
  it('accepts a valid addAsset with a fresh id', () => {
    const project = makeTestProject();
    const asset = { ...project.assets.asset_a!, id: 'asset_b', name: 'B.mp4', path: '/media/B.mp4' };
    expect(validateOperation(project, { type: 'addAsset', asset }).ok).toBe(true);
  });

  it('rejects addAsset with an existing id', () => {
    const project = makeTestProject();
    const result = validateOperation(project, { type: 'addAsset', asset: project.assets.asset_a! });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.code)).toContain('ASSET_EXISTS');
  });

  it('accepts a valid addClip on a compatible track', () => {
    const project = makeTestProject();
    const clip = project.timeline.tracks[0]!.clips[0]!;
    const op: EditOperation = {
      type: 'addClip',
      trackId: 'track_v',
      clip: { ...clip, id: 'clip_new' },
    };
    expect(validateOperation(project, op).ok).toBe(true);
  });

  it('rejects addClip on a missing track', () => {
    const project = makeTestProject();
    const clip = project.timeline.tracks[0]!.clips[0]!;
    const op: EditOperation = { type: 'addClip', trackId: 'nope', clip: { ...clip, id: 'clip_new' } };
    const result = validateOperation(project, op);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.code)).toContain('TRACK_NOT_FOUND');
  });

  it('rejects addClip whose asset kind mismatches the track kind', () => {
    const project = makeTestProject();
    const clip = project.timeline.tracks[0]!.clips[0]!;
    // asset_a is video; adding it to the audio track must fail.
    const op: EditOperation = { type: 'addClip', trackId: 'track_a', clip: { ...clip, id: 'clip_new' } };
    const result = validateOperation(project, op);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.code)).toContain('TRACK_KIND_MISMATCH');
  });

  it('rejects splitClip outside the clip interior', () => {
    expect(ok({ type: 'splitClip', clipId: 'clip_1', atUs: 0, newClipId: 'clip_2' }).ok).toBe(false);
    expect(ok({ type: 'splitClip', clipId: 'clip_1', atUs: 100_000, newClipId: 'clip_2' }).ok).toBe(false);
    expect(ok({ type: 'splitClip', clipId: 'clip_1', atUs: 40_000, newClipId: 'clip_2' }).ok).toBe(true);
  });

  it('rejects splitClip with a used newClipId', () => {
    const result = ok({ type: 'splitClip', clipId: 'clip_1', atUs: 40_000, newClipId: 'clip_1' });
    expect(result.ok).toBe(false);
  });

  it('rejects trimClip beyond the asset duration', () => {
    const result = ok({ type: 'trimClip', clipId: 'clip_1', sourceStartUs: 0, sourceEndUs: 200_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.code)).toContain('TRIM_OUT_OF_RANGE');
  });

  it('rejects operations on a missing clip', () => {
    expect(ok({ type: 'deleteClip', clipId: 'missing' }).ok).toBe(false);
    expect(ok({ type: 'muteClip', clipId: 'missing', muted: true }).ok).toBe(false);
    expect(ok({ type: 'setVolume', clipId: 'missing', volume: 0.5 }).ok).toBe(false);
  });

  it('rejects duplicateClip with a used newClipId', () => {
    expect(ok({ type: 'duplicateClip', clipId: 'clip_1', newClipId: 'clip_1' }).ok).toBe(false);
    expect(ok({ type: 'duplicateClip', clipId: 'clip_1', newClipId: 'clip_fresh' }).ok).toBe(true);
  });
});
