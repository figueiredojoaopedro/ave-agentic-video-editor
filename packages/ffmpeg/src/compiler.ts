import type { Project } from '@agentic-video-editor/editor-core';
import {
  DEFAULT_FRAME_RATE,
  DEFAULT_RENDER_HEIGHT,
  DEFAULT_RENDER_WIDTH,
  type RenderPlan,
  type RenderSegment,
} from './ir.js';

export interface CompileOptions {
  outputPath: string;
  width?: number;
  height?: number;
  frameRate?: number;
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileError';
  }
}

export function compileTimeline(project: Project, options: CompileOptions): RenderPlan {
  const videoTrack = project.timeline.tracks.find((track) => track.kind === 'video');
  if (!videoTrack) throw new CompileError('project has no video track');
  if (videoTrack.clips.length === 0) throw new CompileError('video track has no clips');

  const segments: RenderSegment[] = videoTrack.clips.map((clip) => {
    const asset = project.assets[clip.assetId];
    if (!asset) throw new CompileError(`clip ${clip.id} references missing asset ${clip.assetId}`);
    if (asset.kind !== 'video') {
      throw new CompileError(`asset kind ${asset.kind} is not yet renderable`);
    }
    return {
      sourcePath: asset.path,
      sourceStartUs: clip.sourceStartUs,
      sourceEndUs: clip.sourceEndUs,
      timelineStartUs: clip.timelineStartUs,
      timelineEndUs: clip.timelineEndUs,
      muted: clip.muted,
      volume: clip.volume,
    };
  });

  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index]!;
    const next = segments[index + 1]!;
    if (current.timelineEndUs > next.timelineStartUs) {
      throw new CompileError('overlapping clips are not yet renderable');
    }
  }

  return {
    outputPath: options.outputPath,
    width: options.width ?? DEFAULT_RENDER_WIDTH,
    height: options.height ?? DEFAULT_RENDER_HEIGHT,
    frameRate: options.frameRate ?? DEFAULT_FRAME_RATE,
    segments,
  };
}
