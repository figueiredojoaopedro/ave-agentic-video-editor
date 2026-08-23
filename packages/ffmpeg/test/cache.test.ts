import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Project } from '@agentic-video-editor/editor-core';
import { RenderCache } from '../src/cache.js';
import { RenderQueue } from '../src/queue.js';
import { runFfmpeg } from '../src/runner.js';
import { generateFixtureMedia, type FixtureMedia } from './fixtures.js';

describe('RenderCache', () => {
  let fixture: FixtureMedia;
  let cacheDir: string;
  let cache: RenderCache;

  beforeAll(async () => {
    fixture = await generateFixtureMedia();
    cacheDir = mkdtempSync(join(tmpdir(), 'ave-cache-'));
    cache = new RenderCache({ cacheDir });
  });

  afterAll(() => {
    fixture.cleanup();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  function projectWith(path: string): Project {
    return {
      schemaVersion: 1,
      id: 'project_1',
      name: 'Test',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      assets: {
        asset_a: { id: 'asset_a', name: 'A.mp4', path, kind: 'video', durationUs: 1_000_000, metadata: {} },
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
                sourceStartUs: 0,
                sourceEndUs: 500_000,
                timelineStartUs: 0,
                timelineEndUs: 500_000,
                muted: false,
                volume: 1,
              },
            ],
          },
          { id: 'track_a', kind: 'audio', name: 'A1', clips: [] },
        ],
      },
      metadata: {},
    };
  }

  async function waitForTerminal(queue: RenderQueue, id: string, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const info = queue.get(id);
      if (info && info.status !== 'pending' && info.status !== 'running') return info;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`job ${id} did not reach a terminal state within ${timeoutMs}ms`);
  }

  it('cache has/put/resolvePath round-trips', async () => {
    expect(await cache.has('abc')).toBe(false);
    await cache.put('abc', fixture.avPath);
    expect(await cache.has('abc')).toBe(true);
    expect(cache.resolvePath('abc')).toBe(join(cacheDir, 'abc.mp4'));
  });

  it('a cache hit skips ffmpeg entirely (second enqueue does not re-encode)', async () => {
    let runCount = 0;
    const queue = new RenderQueue({
      cache,
      run: async (args, options) => {
        runCount += 1;
        return runFfmpeg(args, options);
      },
    });
    const project = projectWith(fixture.avPath);

    const job1 = queue.enqueue(project);
    const info1 = await waitForTerminal(queue, job1.id);
    expect(info1.status).toBe('completed');
    expect(runCount).toBe(1);

    const job2 = queue.enqueue(project);
    const info2 = await waitForTerminal(queue, job2.id);
    expect(info2.status).toBe('completed');
    expect(runCount).toBe(1);
    expect(info2.result?.hasVideo).toBe(true);
    expect(info2.result?.outputPath).toBe(cache.resolvePath(info2.manifestHash));
  });

  it('uses the cache path as authoritative even when an outputDir is also provided', async () => {
    const separateDir = mkdtempSync(join(tmpdir(), 'ave-out-'));
    const localCacheDir = mkdtempSync(join(tmpdir(), 'ave-cache2-'));
    const localCache = new RenderCache({ cacheDir: localCacheDir });
    let runCount = 0;
    const queue = new RenderQueue({
      outputDir: separateDir,
      cache: localCache,
      run: async (args, options) => {
        runCount += 1;
        return runFfmpeg(args, options);
      },
    });
    const project = projectWith(fixture.avPath);
    const job1 = queue.enqueue(project);
    const info1 = await waitForTerminal(queue, job1.id);
    expect(info1.status).toBe('completed');
    expect(info1.result?.outputPath).toBe(localCache.resolvePath(info1.manifestHash));
    const job2 = queue.enqueue(project);
    const info2 = await waitForTerminal(queue, job2.id);
    expect(info2.status).toBe('completed');
    expect(runCount).toBe(1);
    rmSync(separateDir, { recursive: true, force: true });
    rmSync(localCacheDir, { recursive: true, force: true });
  });
});
