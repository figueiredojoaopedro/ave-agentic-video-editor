import type { Time } from '@agentic-video-editor/editor-core';

export interface RenderSegment {
  sourcePath: string;
  sourceStartUs: Time;
  sourceEndUs: Time;
  timelineStartUs: Time;
  timelineEndUs: Time;
  muted: boolean;
  volume: number;
}

export interface RenderPlan {
  outputPath: string;
  width: number;
  height: number;
  frameRate: number;
  segments: RenderSegment[];
}

export const DEFAULT_RENDER_WIDTH = 1280;
export const DEFAULT_RENDER_HEIGHT = 720;
export const DEFAULT_FRAME_RATE = 30;

export function planDurationUs(plan: RenderPlan): Time {
  let end: Time = 0;
  for (const segment of plan.segments) {
    if (segment.timelineEndUs > end) end = segment.timelineEndUs;
  }
  return end;
}
