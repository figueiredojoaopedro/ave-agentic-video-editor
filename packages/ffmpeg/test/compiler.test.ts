import { describe, expect, it } from 'vitest';
import type { Project } from '@agentic-video-editor/editor-core';
import { buildRenderManifest, CompileError } from '../src/compiler.js';
import { manifestHash } from '../src/manifest.js';
import { planDurationUs } from '../src/ir.js';

function makeProject(): Project {
  return {
    schemaVersion: 1,
    id: 'project_1',
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: {
      asset_a: {
        id: 'asset_a',
        name: 'A.mp4',
        path: '/media/A.mp4',
        kind: 'video',
        durationUs: 200_000,
        metadata: {},
      },
    },
    timeline: {
      id: 'timeline_1',
      tracks: [
        {
          id: 'track_v',
          kind: 'video',
          name: 'V1',
          clips: [
            {
              id: 'clip_1',
              assetId: 'asset_a',
              name: 'A',
              sourceStartUs: 10_000,
              sourceEndUs: 110_000,
              timelineStartUs: 0,
              timelineEndUs: 100_000,
              muted: false,
              volume: 1,
            },
            {
              id: 'clip_2',
              assetId: 'asset_a',
              name: 'B',
              sourceStartUs: 0,
              sourceEndUs: 50_000,
              timelineStartUs: 150_000,
              timelineEndUs: 200_000,
              muted: true,
              volume: 0.5,
            },
          ],
        },
        { id: 'track_a', kind: 'audio', name: 'A1', clips: [] },
      ],
    },
    metadata: {},
  };
}

describe('buildRenderManifest', () => {
  it('maps clips to segments with source and timeline ranges', () => {
    const manifest = buildRenderManifest(makeProject());
    expect(manifest.version).toBe(1);
    expect(manifest.segments).toHaveLength(2);
    expect(manifest.segments[0]).toMatchObject({
      sourcePath: '/media/A.mp4',
      sourceStartUs: 10_000,
      sourceEndUs: 110_000,
      timelineStartUs: 0,
      timelineEndUs: 100_000,
      muted: false,
      volume: 1,
    });
    expect(manifest.segments[1]).toMatchObject({ muted: true, volume: 0.5 });
  });

  it('applies output options with defaults', () => {
    const manifest = buildRenderManifest(makeProject(), { width: 640, height: 360, frameRate: 24 });
    expect(manifest.output.width).toBe(640);
    expect(manifest.output.height).toBe(360);
    expect(manifest.output.frameRate).toBe(24);
    const defaults = buildRenderManifest(makeProject());
    expect(defaults.output.width).toBe(1280);
    expect(defaults.output.height).toBe(720);
    expect(defaults.output.frameRate).toBe(30);
  });

  it('throws CompileError when the project has no video track', () => {
    const project = makeProject();
    project.timeline.tracks = [{ id: 't', kind: 'audio', name: 'A', clips: [] }];
    expect(() => buildRenderManifest(project)).toThrow(CompileError);
  });

  it('throws CompileError when the video track has no clips', () => {
    const project = makeProject();
    project.timeline.tracks[0]!.clips = [];
    expect(() => buildRenderManifest(project)).toThrow(CompileError);
  });

  it('throws CompileError when a clip references a missing asset', () => {
    const project = makeProject();
    project.timeline.tracks[0]!.clips[0]!.assetId = 'missing';
    expect(() => buildRenderManifest(project)).toThrow(CompileError);
  });

  it('throws CompileError when clips overlap', () => {
    const project = makeProject();
    project.timeline.tracks[0]!.clips[1]!.timelineStartUs = 90_000;
    project.timeline.tracks[0]!.clips[1]!.timelineEndUs = 140_000;
    expect(() => buildRenderManifest(project)).toThrow(/overlapping/);
  });
});

describe('manifestHash', () => {
  it('is deterministic for identical manifests', () => {
    expect(manifestHash(buildRenderManifest(makeProject()))).toBe(
      manifestHash(buildRenderManifest(makeProject())),
    );
  });

  it('changes when output settings change', () => {
    const a = manifestHash(buildRenderManifest(makeProject()));
    const b = manifestHash(buildRenderManifest(makeProject(), { width: 640 }));
    expect(a).not.toBe(b);
  });

  it('changes when segment content changes', () => {
    const base = makeProject();
    const a = manifestHash(buildRenderManifest(base));
    base.timeline.tracks[0]!.clips[0]!.timelineStartUs = 5_000;
    base.timeline.tracks[0]!.clips[0]!.timelineEndUs = 105_000;
    expect(manifestHash(buildRenderManifest(base))).not.toBe(a);
  });
});

describe('planDurationUs', () => {
  it('computes the max timeline end', () => {
    expect(planDurationUs(buildRenderManifest(makeProject()))).toBe(200_000);
  });
});
