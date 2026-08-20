import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Project } from '@agentic-video-editor/editor-core';
import { probeFile } from '@agentic-video-editor/media';
import { buildFfmpegArgs } from './args.js';
import { compileTimeline, type CompileOptions } from './compiler.js';
import { planDurationUs } from './ir.js';
import { runFfmpeg } from './runner.js';

export interface RenderOptions {
  outputPath?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  durationToleranceUs?: number;
}

export interface RenderResult {
  outputPath: string;
  durationUs: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export class RenderError extends Error {
  constructor(
    message: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = 'RenderError';
  }
}

const DEFAULT_DURATION_TOLERANCE_US = 200_000;

export async function renderProject(project: Project, options: RenderOptions = {}): Promise<RenderResult> {
  const outputPath =
    options.outputPath ??
    join(tmpdir(), `ave-render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);

  const compileOptions: CompileOptions = { outputPath };
  if (options.width !== undefined) compileOptions.width = options.width;
  if (options.height !== undefined) compileOptions.height = options.height;
  if (options.frameRate !== undefined) compileOptions.frameRate = options.frameRate;

  let plan;
  try {
    plan = compileTimeline(project, compileOptions);
  } catch (error) {
    throw new RenderError(`failed to compile render plan: ${toMessage(error)}`, toError(error));
  }

  try {
    await runFfmpeg(buildFfmpegArgs(plan));
  } catch (error) {
    throw new RenderError(`ffmpeg render failed: ${toMessage(error)}`, toError(error));
  }

  let info;
  try {
    info = await probeFile(outputPath);
  } catch (error) {
    throw new RenderError(`render produced unreadable output: ${toMessage(error)}`, toError(error));
  }

  const expectedDurationUs = planDurationUs(plan);
  const toleranceUs = options.durationToleranceUs ?? DEFAULT_DURATION_TOLERANCE_US;
  if (Math.abs(info.durationUs - expectedDurationUs) > toleranceUs) {
    throw new RenderError(
      `render duration ${info.durationUs}us deviates from expected ${expectedDurationUs}us by more than ${toleranceUs}us`,
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
  return result;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown): Error | undefined {
  return error instanceof Error ? error : undefined;
}
