import { describe, expect, it } from 'vitest';
import { EditOperationSchema, isEditOperation } from '../src/operations/index.js';
import { makeTestProject } from './helpers.js';

describe('operation schemas', () => {
  it('parses an addAsset operation', () => {
    const project = makeTestProject();
    const op = { type: 'addAsset' as const, asset: project.assets.asset_a! };
    expect(EditOperationSchema.safeParse(op).success).toBe(true);
  });

  it('parses a splitClip operation', () => {
    const op = { type: 'splitClip' as const, clipId: 'clip_1', atUs: 40_000, newClipId: 'clip_2' };
    expect(EditOperationSchema.safeParse(op).success).toBe(true);
  });

  it('rejects a splitClip with a negative atUs', () => {
    const op = { type: 'splitClip' as const, clipId: 'clip_1', atUs: -1, newClipId: 'clip_2' };
    expect(EditOperationSchema.safeParse(op).success).toBe(false);
  });

  it('rejects an unknown operation type', () => {
    const op = { type: 'nope', clipId: 'clip_1' };
    expect(EditOperationSchema.safeParse(op).success).toBe(false);
  });

  it('rejects a setVolume with volume out of range', () => {
    const op = { type: 'setVolume' as const, clipId: 'clip_1', volume: 1.5 };
    expect(EditOperationSchema.safeParse(op).success).toBe(false);
  });

  it('isEditOperation narrows unknown input', () => {
    const op = { type: 'deleteClip' as const, clipId: 'clip_1' };
    expect(isEditOperation(op)).toBe(true);
    expect(isEditOperation({ type: 'nope' })).toBe(false);
  });
});
