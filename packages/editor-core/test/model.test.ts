import { describe, expect, it } from 'vitest';
import { AssetSchema, ClipSchema, ProjectSchema, TimelineSchema } from '../src/model/index.js';
import { makeTestProject } from './helpers.js';

describe('model schemas', () => {
  it('parses a valid asset', () => {
    const asset = makeTestProject().assets.asset_a!;
    expect(AssetSchema.safeParse(asset).success).toBe(true);
  });

  it('rejects an asset with a negative duration', () => {
    const asset = { ...makeTestProject().assets.asset_a!, durationUs: -10 };
    expect(AssetSchema.safeParse(asset).success).toBe(false);
  });

  it('rejects a clip whose source and timeline durations differ', () => {
    const clip = makeTestProject().timeline.tracks[0]!.clips[0]!;
    const bad = { ...clip, timelineEndUs: clip.timelineEndUs + 1 };
    expect(ClipSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a clip whose sourceEndUs is before sourceStartUs', () => {
    const clip = makeTestProject().timeline.tracks[0]!.clips[0]!;
    const bad = { ...clip, sourceEndUs: clip.sourceStartUs - 1 };
    expect(ClipSchema.safeParse(bad).success).toBe(false);
  });

  it('parses a valid project', () => {
    expect(ProjectSchema.safeParse(makeTestProject()).success).toBe(true);
  });

  it('rejects a project whose clip references a missing asset', () => {
    const project = makeTestProject();
    project.timeline.tracks[0]!.clips[0]!.assetId = 'missing';
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it('rejects a project with duplicate clip ids across tracks', () => {
    const project = makeTestProject();
    const clip = project.timeline.tracks[0]!.clips[0]!;
    project.timeline.tracks[1]!.clips.push({ ...clip, id: 'clip_1' });
    expect(TimelineSchema.safeParse(project.timeline).success).toBe(false);
  });
});
