import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Project } from '@agentic-video-editor/editor-core';
import { renderProject, RenderError } from '../src/render.js';
import { generateFixtureMedia, type FixtureMedia } from './fixtures.js';

describe('renderProject', () => {
  let fixture: FixtureMedia;
  beforeAll(async () => {
    fixture = await generateFixtureMedia();
  });
  afterAll(() => {
    fixture.cleanup();
  });

  function makeProject(clips: Array<{
    id: string;
    sourceStartUs: number;
    sourceEndUs: number;
    timelineStartUs: number;
    timelineEndUs: number;
    muted?: boolean;
    volume?: number;
  }>): Project {
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
          path: fixture.avPath,
          kind: 'video',
          durationUs: 1_000_000,
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
            clips: clips.map((clip) => ({
              id: clip.id,
              assetId: 'asset_a',
              name: clip.id,
              sourceStartUs: clip.sourceStartUs,
              sourceEndUs: clip.sourceEndUs,
              timelineStartUs: clip.timelineStartUs,
              timelineEndUs: clip.timelineEndUs,
              muted: clip.muted ?? false,
              volume: clip.volume ?? 1,
            })),
          },
          { id: 'track_a', kind: 'audio', name: 'A1', clips: [] },
        ],
      },
      metadata: {},
    };
  }

  it('renders a single trimmed clip and reports output metadata', async () => {
    const project = makeProject([
      { id: 'clip_1', sourceStartUs: 0, sourceEndUs: 500_000, timelineStartUs: 0, timelineEndUs: 500_000 },
    ]);
    const result = await renderProject(project, { width: 320, height: 240 });
    expect(existsSync(result.outputPath)).toBe(true);
    expect(result.hasVideo).toBe(true);
    expect(result.hasAudio).toBe(true);
    expect(result.width).toBe(320);
    expect(result.height).toBe(240);
    expect(Math.abs(result.durationUs - 500_000)).toBeLessThanOrEqual(200_000);
  });

  it('renders gapped segments and fills the gap with black + silence', async () => {
    const project = makeProject([
      { id: 'clip_1', sourceStartUs: 0, sourceEndUs: 300_000, timelineStartUs: 0, timelineEndUs: 300_000 },
      { id: 'clip_2', sourceStartUs: 100_000, sourceEndUs: 300_000, timelineStartUs: 400_000, timelineEndUs: 600_000 },
    ]);
    const result = await renderProject(project);
    expect(result.hasVideo).toBe(true);
    expect(result.hasAudio).toBe(true);
    expect(Math.abs(result.durationUs - 600_000)).toBeLessThanOrEqual(200_000);
  });

  it('rejects overlapping clips with RenderError', async () => {
    const project = makeProject([
      { id: 'clip_1', sourceStartUs: 0, sourceEndUs: 500_000, timelineStartUs: 0, timelineEndUs: 500_000 },
      { id: 'clip_2', sourceStartUs: 0, sourceEndUs: 500_000, timelineStartUs: 300_000, timelineEndUs: 800_000 },
    ]);
    await expect(renderProject(project)).rejects.toBeInstanceOf(RenderError);
  });

  it('never mutates the input project', async () => {
    const project = makeProject([
      { id: 'clip_1', sourceStartUs: 0, sourceEndUs: 500_000, timelineStartUs: 0, timelineEndUs: 500_000 },
    ]);
    const snapshot = structuredClone(project);
    await renderProject(project);
    expect(project).toEqual(snapshot);
  });
});
