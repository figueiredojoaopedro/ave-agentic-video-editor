import { describe, expect, it } from 'vitest';
import type { Project } from '@agentic-video-editor/editor-core';
import { compileTimeline, CompileError } from '../src/compiler.js';
import { buildFfmpegArgs } from '../src/args.js';
import { planDurationUs, type RenderPlan } from '../src/ir.js';

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

describe('compileTimeline', () => {
  it('maps clips to segments with source and timeline ranges', () => {
    const plan = compileTimeline(makeProject(), { outputPath: '/out/render.mp4' });
    expect(plan.segments).toHaveLength(2);
    expect(plan.segments[0]).toMatchObject({
      sourcePath: '/media/A.mp4',
      sourceStartUs: 10_000,
      sourceEndUs: 110_000,
      timelineStartUs: 0,
      timelineEndUs: 100_000,
      muted: false,
      volume: 1,
    });
    expect(plan.segments[1]).toMatchObject({ muted: true, volume: 0.5 });
  });

  it('applies output options with defaults', () => {
    const plan = compileTimeline(makeProject(), { outputPath: '/out/render.mp4', width: 640, height: 360, frameRate: 24 });
    expect(plan.outputPath).toBe('/out/render.mp4');
    expect(plan.width).toBe(640);
    expect(plan.height).toBe(360);
    expect(plan.frameRate).toBe(24);
    const defaults = compileTimeline(makeProject(), { outputPath: '/out/x.mp4' });
    expect(defaults.width).toBe(1280);
    expect(defaults.height).toBe(720);
    expect(defaults.frameRate).toBe(30);
  });

  it('throws CompileError when the project has no video track', () => {
    const project = makeProject();
    project.timeline.tracks = [{ id: 't', kind: 'audio', name: 'A', clips: [] }];
    expect(() => compileTimeline(project, { outputPath: '/out/x.mp4' })).toThrow(CompileError);
  });

  it('throws CompileError when the video track has no clips', () => {
    const project = makeProject();
    project.timeline.tracks[0]!.clips = [];
    expect(() => compileTimeline(project, { outputPath: '/out/x.mp4' })).toThrow(CompileError);
  });

  it('throws CompileError when a clip references a missing asset', () => {
    const project = makeProject();
    project.timeline.tracks[0]!.clips[0]!.assetId = 'missing';
    expect(() => compileTimeline(project, { outputPath: '/out/x.mp4' })).toThrow(CompileError);
  });

  it('throws CompileError when clips overlap', () => {
    const project = makeProject();
    project.timeline.tracks[0]!.clips[1]!.timelineStartUs = 90_000;
    project.timeline.tracks[0]!.clips[1]!.timelineEndUs = 140_000;
    expect(() => compileTimeline(project, { outputPath: '/out/x.mp4' })).toThrow(/overlapping/);
  });
});

describe('buildFfmpegArgs', () => {
  function plan(): RenderPlan {
    return compileTimeline(makeProject(), { outputPath: '/out/render.mp4', width: 640, height: 360, frameRate: 24 });
  }

  it('adds one -i per segment and maps the concat outputs', () => {
    const args = buildFfmpegArgs(plan());
    const inputCount = args.filter((arg) => arg === '-i').length;
    expect(inputCount).toBe(2);
    expect(args).toContain('-filter_complex');
    expect(args).toContain('[vout]');
    expect(args).toContain('[aout]');
    expect(args).toContain('-y');
    expect(args[args.length - 1]).toBe('/out/render.mp4');
  });

  it('normalizes video to the target size, fps, and format', () => {
    const args = buildFfmpegArgs(plan());
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    expect(filter).toContain('fps=24');
    expect(filter).toContain('scale=640:360:force_original_aspect_ratio=decrease');
    expect(filter).toContain('pad=640:360');
    expect(filter).toContain('format=yuv420p');
  });

  it('encodes mute as volume 0 and keeps numeric volume', () => {
    const args = buildFfmpegArgs(plan());
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    expect(filter).toContain('volume=0.0');
    expect(filter).toContain('volume=1.0000');
  });

  it('inserts black + silence fillers between gapped segments', () => {
    const args = buildFfmpegArgs(plan());
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    // gap between 100_000us and 150_000us = 50_000us = 0.050000s
    expect(filter).toContain('color=c=black:s=640x360:d=0.050000:r=24');
    expect(filter).toContain('anullsrc=channel_layout=stereo:sample_rate=48000');
    expect(filter).toContain('concat=n=3:v=1:a=1[vout][aout]');
  });

  it('normalizes audio sample rate and layout before concat', () => {
    const args = buildFfmpegArgs(plan());
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    expect(filter).toContain('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');
  });

  it('computes plan duration from the last segment end', () => {
    expect(planDurationUs(plan())).toBe(200_000);
  });
});
