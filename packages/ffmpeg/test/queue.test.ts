import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Project } from '@agentic-video-editor/editor-core';
import { FfmpegCancelledError, FfmpegError, type RunResult } from '../src/runner.js';
import { RenderQueue } from '../src/queue.js';
import { generateFixtureMedia, type FixtureMedia } from './fixtures.js';

describe('RenderQueue', () => {
  let fixture: FixtureMedia;
  let outputDir: string;

  beforeAll(async () => {
    fixture = await generateFixtureMedia();
    outputDir = mkdtempSync(join(tmpdir(), 'ave-queue-'));
  });

  afterAll(() => {
    fixture.cleanup();
    rmSync(outputDir, { recursive: true, force: true });
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

  async function waitForTerminal(queue: RenderQueue, id: string, timeoutMs = 10_000): Promise<import('../src/queue.js').RenderJobInfo> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const info = queue.get(id);
      if (info && info.status !== 'pending' && info.status !== 'running') return info;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`job ${id} did not reach a terminal state within ${timeoutMs}ms`);
  }

  it('completes a real render and reports output metadata', async () => {
    const queue = new RenderQueue({ outputDir });
    const job = queue.enqueue(projectWith(fixture.avPath));
    const info = await waitForTerminal(queue, job.id);
    expect(info.status).toBe('completed');
    expect(info.progress).toBe(1);
    expect(info.result?.hasVideo).toBe(true);
    expect(info.result?.hasAudio).toBe(true);
    expect(info.result?.outputPath).toBeDefined();
    expect(existsSync(info.result!.outputPath)).toBe(true);
  });

  it('cancels a running job via abort and marks it cancelled', async () => {
    const queue = new RenderQueue({
      outputDir,
      run: (_args, options) =>
        new Promise<RunResult>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new FfmpegCancelledError()),
            { once: true },
          );
        }),
    });
    const job = queue.enqueue(projectWith(fixture.avPath));
    expect(queue.cancel(job.id)).toBe(true);
    const info = await waitForTerminal(queue, job.id);
    expect(info.status).toBe('cancelled');
  });

  it('cancels a pending job before it runs', async () => {
    const queue = new RenderQueue({
      outputDir,
      run: () => new Promise<RunResult>((_resolve, reject) => setTimeout(() => reject(new FfmpegError('x')), 500)),
    });
    const first = queue.enqueue(projectWith(fixture.avPath));
    const second = queue.enqueue(projectWith(fixture.avPath));
    expect(queue.cancel(second.id)).toBe(true);
    const firstInfo = await waitForTerminal(queue, first.id);
    expect(firstInfo.status).toBe('failed');
    expect(queue.get(second.id)?.status).toBe('cancelled');
  });

  it('marks a job failed when the runner rejects with an error', async () => {
    const queue = new RenderQueue({
      outputDir,
      run: () => Promise.reject(new FfmpegError('boom')),
    });
    const job = queue.enqueue(projectWith(fixture.avPath));
    const info = await waitForTerminal(queue, job.id);
    expect(info.status).toBe('failed');
    expect(info.error).toContain('boom');
  });

  it('serializes execution to one job at a time', async () => {
    let active = 0;
    let maxActive = 0;
    const queue = new RenderQueue({
      outputDir,
      run: () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        return new Promise<RunResult>((resolve, reject) => {
          setTimeout(() => {
            active -= 1;
            reject(new FfmpegError('done'));
          }, 100);
        });
      },
    });
    queue.enqueue(projectWith(fixture.avPath));
    queue.enqueue(projectWith(fixture.avPath));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(maxActive).toBe(1);
  });
});
