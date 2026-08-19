import type { Asset, Clip, Project } from '../src/model/index.js';

export const TEST_ASSET: Asset = {
  id: 'asset_a',
  name: 'A.mp4',
  path: '/media/A.mp4',
  kind: 'video',
  durationUs: 100_000,
  width: 1920,
  height: 1080,
  fps: 30,
  metadata: {},
};

export function makeTestProject(): Project {
  const clip: Clip = {
    id: 'clip_1',
    assetId: 'asset_a',
    name: 'A',
    sourceStartUs: 0,
    sourceEndUs: 100_000,
    timelineStartUs: 0,
    timelineEndUs: 100_000,
    muted: false,
    volume: 1,
  };
  return {
    schemaVersion: 1,
    id: 'project_1',
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: { asset_a: TEST_ASSET },
    timeline: {
      id: 'timeline_1',
      tracks: [
        { id: 'track_v', kind: 'video', name: 'V1', clips: [clip] },
        { id: 'track_a', kind: 'audio', name: 'A1', clips: [] },
      ],
    },
    metadata: {},
  };
}
