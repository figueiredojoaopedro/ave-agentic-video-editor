import { mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createId, type Project } from '@agentic-video-editor/editor-core';
import { probeFile } from '@agentic-video-editor/media';
import { buildFfmpegArgs } from './args.js';
import { buildRenderManifest, type CompileOptions } from './compiler.js';
import { planDurationUs, type RenderManifest } from './ir.js';
import { manifestHash } from './manifest.js';
import { FfmpegCancelledError, runFfmpeg, type RunOptions, type RunResult } from './runner.js';
import type { RenderResult } from './render.js';

export type RenderJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RenderJobInfo {
  id: string;
  status: RenderJobStatus;
  progress: number;
  manifestHash: string;
  error?: string;
  result?: RenderResult;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

interface RenderJob {
  info: RenderJobInfo;
  manifest: RenderManifest;
  controller?: AbortController;
  cancelled: boolean;
}

export type RunFn = (args: string[], options: RunOptions) => Promise<RunResult>;

export interface RenderQueueOptions {
  outputDir?: string;
  durationToleranceUs?: number;
  /** Injectable ffmpeg runner for deterministic tests. Defaults to runFfmpeg. */
  run?: RunFn;
}

export class RenderQueue {
  private readonly jobs = new Map<string, RenderJob>();
  private readonly pending: RenderJob[] = [];
  private readonly outputDir: string;
  private readonly toleranceUs: number;
  private readonly run: RunFn;
  private drainPromise: Promise<void> | null = null;

  constructor(options: RenderQueueOptions = {}) {
    this.outputDir = options.outputDir ?? join(tmpdir(), 'ave-renders');
    this.toleranceUs = options.durationToleranceUs ?? 200_000;
    this.run = options.run ?? runFfmpeg;
  }

  get(id: string): RenderJobInfo | undefined {
    return this.jobs.get(id)?.info;
  }

  list(): RenderJobInfo[] {
    return [...this.jobs.values()].map((job) => job.info);
  }

  enqueue(project: Project, options: CompileOptions = {}): RenderJobInfo {
    const manifest = buildRenderManifest(project, options);
    const job: RenderJob = {
      info: {
        id: createId('job'),
        status: 'pending',
        progress: 0,
        manifestHash: manifestHash(manifest),
        createdAt: Date.now(),
      },
      manifest,
      cancelled: false,
    };
    this.jobs.set(job.info.id, job);
    this.pending.push(job);
    void this.drain();
    return job.info;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.info.status === 'pending') {
      job.info.status = 'cancelled';
      job.info.finishedAt = Date.now();
      const index = this.pending.indexOf(job);
      if (index !== -1) this.pending.splice(index, 1);
      return true;
    }
    if (job.info.status === 'running') {
      job.cancelled = true;
      job.controller?.abort();
      return true;
    }
    return false;
  }

  private async drain(): Promise<void> {
    if (!this.drainPromise) {
      this.drainPromise = this.runLoop().finally(() => {
        this.drainPromise = null;
      });
    }
    await this.drainPromise;
  }

  private async runLoop(): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    while (this.pending.length > 0) {
      const job = this.pending.shift()!;
      await this.execute(job);
    }
  }

  private async execute(job: RenderJob): Promise<void> {
    job.info.status = 'running';
    job.info.startedAt = Date.now();
    job.controller = new AbortController();

    const outputPath = join(this.outputDir, `${job.info.manifestHash}.mp4`);
    const durationUs = planDurationUs(job.manifest);

    try {
      await this.run(
        [...buildFfmpegArgs(job.manifest, outputPath), '-progress', 'pipe:1', '-nostats'],
        {
          signal: job.controller.signal,
          onProgress: (outTimeUs) => {
            job.info.progress = durationUs > 0 ? Math.min(1, outTimeUs / durationUs) : 0;
          },
        },
      );

      const info = await probeFile(outputPath);
      if (Math.abs(info.durationUs - durationUs) > this.toleranceUs) {
        throw new Error(
          `render duration ${info.durationUs}us deviates from expected ${durationUs}us by more than ${this.toleranceUs}us`,
        );
      }

      const result: RenderResult = {
        outputPath,
        durationUs: info.durationUs,
        hasVideo: info.hasVideo,
        hasAudio: info.hasAudio,
      };
      if (info.videoStream?.width !== undefined) result.width = info.videoStream.width;
      if (info.videoStream?.height !== undefined) result.height = info.videoStream.height;
      job.info.result = result;
      job.info.progress = 1;
      job.info.status = 'completed';
    } catch (error) {
      await unlink(outputPath).catch(() => {});
      if (job.cancelled || error instanceof FfmpegCancelledError) {
        job.info.status = 'cancelled';
      } else {
        job.info.status = 'failed';
        job.info.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      job.info.finishedAt = Date.now();
    }
  }
}
