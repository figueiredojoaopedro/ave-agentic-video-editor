import { createId, type EditOperation, type Project } from '@agentic-video-editor/editor-core';
import { z } from 'zod';
import type { AgentContext } from './context.js';

export interface ToolResult {
  ok: boolean;
  message: string;
}

export interface AgentTool {
  name: string;
  description: string;
  kind: 'read' | 'edit';
  parametersSchema: z.ZodTypeAny;
  /** OpenAI-style JSON Schema for the provider */
  parametersJsonSchema: Record<string, unknown>;
  handler(context: AgentContext, rawArguments: string): Promise<ToolResult>;
}

interface ToolSpec<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  kind: 'read' | 'edit';
  parametersSchema: S;
  parametersJsonSchema: Record<string, unknown>;
  execute(context: AgentContext, args: z.infer<S>): Promise<ToolResult>;
}

function makeTool<S extends z.ZodTypeAny>(spec: ToolSpec<S>): AgentTool {
  return {
    name: spec.name,
    description: spec.description,
    kind: spec.kind,
    parametersSchema: spec.parametersSchema,
    parametersJsonSchema: spec.parametersJsonSchema,
    async handler(context, rawArguments) {
      const parsed = parseArguments(spec.parametersSchema, rawArguments);
      if (!parsed.ok) return parsed;
      return spec.execute(context, parsed.data);
    },
  };
}

function parseArguments<S extends z.ZodTypeAny>(
  schema: S,
  rawArguments: string,
): { ok: true; data: z.infer<S> } | { ok: false; message: string } {
  let value: unknown;
  try {
    value = JSON.parse(rawArguments);
  } catch {
    return { ok: false, message: 'invalid arguments: not valid JSON' };
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return { ok: false, message: `invalid arguments: ${detail}` };
  }
  return { ok: true, data: result.data };
}

const NO_PARAMS: Record<string, unknown> = { type: 'object', properties: {}, required: [] };

export const GET_PROJECT_TOOL = makeTool({
  name: 'getProject',
  description: 'Get a summary of the current project (name, asset count, track and clip counts).',
  kind: 'read',
  parametersSchema: z.object({}),
  parametersJsonSchema: NO_PARAMS,
  async execute(context) {
    return { ok: true, message: summarizeProject(context.getProject()) };
  },
});

export const GET_TIMELINE_TOOL = makeTool({
  name: 'getTimeline',
  description: 'Get the full timeline: every track and every clip with source and timeline ranges, muted, and volume.',
  kind: 'read',
  parametersSchema: z.object({}),
  parametersJsonSchema: NO_PARAMS,
  async execute(context) {
    const project = context.getProject();
    const lines: string[] = [];
    for (const track of project.timeline.tracks) {
      if (track.clips.length === 0) {
        lines.push(`${track.kind} track '${track.name}': (empty)`);
        continue;
      }
      lines.push(`${track.kind} track '${track.name}':`);
      for (const clip of track.clips) {
        lines.push(
          `  ${clip.id} (${clip.name}) source ${clip.sourceStartUs}..${clip.sourceEndUs}us timeline ${clip.timelineStartUs}..${clip.timelineEndUs}us muted=${clip.muted} volume=${clip.volume}`,
        );
      }
    }
    return { ok: true, message: lines.join('\n') || '(empty timeline)' };
  },
});

export const GET_ASSETS_TOOL = makeTool({
  name: 'getAssets',
  description: 'List all imported assets with id, name, kind, and duration.',
  kind: 'read',
  parametersSchema: z.object({}),
  parametersJsonSchema: NO_PARAMS,
  async execute(context) {
    const project = context.getProject();
    const assets = Object.values(project.assets);
    if (assets.length === 0) return { ok: true, message: '(no assets)' };
    return {
      ok: true,
      message: assets.map((asset) => `${asset.id} (${asset.name}) ${asset.kind} ${asset.durationUs}us`).join('\n'),
    };
  },
});

export const GET_CLIP_TOOL = makeTool({
  name: 'getClip',
  description: 'Get the details of one clip by id, or an error if it does not exist.',
  kind: 'read',
  parametersSchema: z.object({ clipId: z.string().min(1) }),
  parametersJsonSchema: {
    type: 'object',
    properties: { clipId: { type: 'string' } },
    required: ['clipId'],
  },
  async execute(context, args) {
    const project = context.getProject();
    for (const track of project.timeline.tracks) {
      const clip = track.clips.find((c) => c.id === args.clipId);
      if (clip) {
        return {
          ok: true,
          message: `${clip.id} (${clip.name}) asset=${clip.assetId} source ${clip.sourceStartUs}..${clip.sourceEndUs}us timeline ${clip.timelineStartUs}..${clip.timelineEndUs}us muted=${clip.muted} volume=${clip.volume}`,
        };
      }
    }
    return { ok: false, message: `clip not found: ${args.clipId}` };
  },
});

export const SPLIT_CLIP_TOOL = makeTool({
  name: 'splitClip',
  description: 'Split a clip at a timeline position in microseconds. The split point must be strictly inside the clip.',
  kind: 'edit',
  parametersSchema: z.object({
    clipId: z.string().min(1),
    atUs: z.number().int().nonnegative(),
  }),
  parametersJsonSchema: {
    type: 'object',
    properties: {
      clipId: { type: 'string' },
      atUs: { type: 'integer', minimum: 0 },
    },
    required: ['clipId', 'atUs'],
  },
  async execute(context, args) {
    return applyEdit(context, { type: 'splitClip', clipId: args.clipId, atUs: args.atUs, newClipId: createId('clip') }, 'splitClip');
  },
});

export const TRIM_CLIP_TOOL = makeTool({
  name: 'trimClip',
  description: 'Trim a clip to new source boundaries in microseconds. timelineStartUs stays fixed.',
  kind: 'edit',
  parametersSchema: z.object({
    clipId: z.string().min(1),
    sourceStartUs: z.number().int().nonnegative(),
    sourceEndUs: z.number().int().nonnegative(),
  }),
  parametersJsonSchema: {
    type: 'object',
    properties: {
      clipId: { type: 'string' },
      sourceStartUs: { type: 'integer', minimum: 0 },
      sourceEndUs: { type: 'integer', minimum: 0 },
    },
    required: ['clipId', 'sourceStartUs', 'sourceEndUs'],
  },
  async execute(context, args) {
    return applyEdit(
      context,
      { type: 'trimClip', clipId: args.clipId, sourceStartUs: args.sourceStartUs, sourceEndUs: args.sourceEndUs },
      'trimClip',
    );
  },
});

export const DELETE_CLIP_TOOL = makeTool({
  name: 'deleteClip',
  description: 'Delete a clip from the timeline by id.',
  kind: 'edit',
  parametersSchema: z.object({ clipId: z.string().min(1) }),
  parametersJsonSchema: {
    type: 'object',
    properties: { clipId: { type: 'string' } },
    required: ['clipId'],
  },
  async execute(context, args) {
    return applyEdit(context, { type: 'deleteClip', clipId: args.clipId }, 'deleteClip');
  },
});

export const MOVE_CLIP_TOOL = makeTool({
  name: 'moveClip',
  description: 'Move a clip so it starts at a new timeline position in microseconds within its track.',
  kind: 'edit',
  parametersSchema: z.object({
    clipId: z.string().min(1),
    timelineStartUs: z.number().int().nonnegative(),
  }),
  parametersJsonSchema: {
    type: 'object',
    properties: {
      clipId: { type: 'string' },
      timelineStartUs: { type: 'integer', minimum: 0 },
    },
    required: ['clipId', 'timelineStartUs'],
  },
  async execute(context, args) {
    return applyEdit(
      context,
      { type: 'moveClip', clipId: args.clipId, timelineStartUs: args.timelineStartUs },
      'moveClip',
    );
  },
});

export const DUPLICATE_CLIP_TOOL = makeTool({
  name: 'duplicateClip',
  description: 'Duplicate a clip, placing the copy immediately after the original.',
  kind: 'edit',
  parametersSchema: z.object({ clipId: z.string().min(1) }),
  parametersJsonSchema: {
    type: 'object',
    properties: { clipId: { type: 'string' } },
    required: ['clipId'],
  },
  async execute(context, args) {
    return applyEdit(
      context,
      { type: 'duplicateClip', clipId: args.clipId, newClipId: createId('clip') },
      'duplicateClip',
    );
  },
});

export const MUTE_CLIP_TOOL = makeTool({
  name: 'muteClip',
  description: 'Mute or unmute a clip.',
  kind: 'edit',
  parametersSchema: z.object({
    clipId: z.string().min(1),
    muted: z.boolean(),
  }),
  parametersJsonSchema: {
    type: 'object',
    properties: { clipId: { type: 'string' }, muted: { type: 'boolean' } },
    required: ['clipId', 'muted'],
  },
  async execute(context, args) {
    return applyEdit(context, { type: 'muteClip', clipId: args.clipId, muted: args.muted }, 'muteClip');
  },
});

export const SET_VOLUME_TOOL = makeTool({
  name: 'setVolume',
  description: 'Set a clip volume between 0 and 1.',
  kind: 'edit',
  parametersSchema: z.object({
    clipId: z.string().min(1),
    volume: z.number().min(0).max(1),
  }),
  parametersJsonSchema: {
    type: 'object',
    properties: { clipId: { type: 'string' }, volume: { type: 'number', minimum: 0, maximum: 1 } },
    required: ['clipId', 'volume'],
  },
  async execute(context, args) {
    return applyEdit(context, { type: 'setVolume', clipId: args.clipId, volume: args.volume }, 'setVolume');
  },
});

export const UNDO_TOOL = makeTool({
  name: 'undo',
  description: 'Undo the most recent edit operation.',
  kind: 'edit',
  parametersSchema: z.object({}),
  parametersJsonSchema: NO_PARAMS,
  async execute(context) {
    const project = context.undo();
    if (!project) return { ok: false, message: 'nothing to undo' };
    return { ok: true, message: 'undid the last operation' };
  },
});

export const REDO_TOOL = makeTool({
  name: 'redo',
  description: 'Redo the most recently undone edit operation.',
  kind: 'edit',
  parametersSchema: z.object({}),
  parametersJsonSchema: NO_PARAMS,
  async execute(context) {
    const project = context.redo();
    if (!project) return { ok: false, message: 'nothing to redo' };
    return { ok: true, message: 'redid the last undone operation' };
  },
});

export const ALL_TOOLS: AgentTool[] = [
  GET_PROJECT_TOOL,
  GET_TIMELINE_TOOL,
  GET_ASSETS_TOOL,
  GET_CLIP_TOOL,
  SPLIT_CLIP_TOOL,
  TRIM_CLIP_TOOL,
  DELETE_CLIP_TOOL,
  MOVE_CLIP_TOOL,
  DUPLICATE_CLIP_TOOL,
  MUTE_CLIP_TOOL,
  SET_VOLUME_TOOL,
  UNDO_TOOL,
  REDO_TOOL,
];

function applyEdit(context: AgentContext, operation: EditOperation, name: string): ToolResult {
  const outcome = context.applyOperation(operation);
  if (!outcome.ok) {
    const first = outcome.errors?.[0];
    return { ok: false, message: `rejected: ${first?.code ?? 'ERROR'}: ${first?.message ?? 'operation failed'}` };
  }
  return { ok: true, message: `applied ${name}` };
}

function summarizeProject(project: Project): string {
  const assetCount = Object.keys(project.assets).length;
  const trackSummaries = project.timeline.tracks
    .map((track) => `${track.kind}:${track.clips.length} clips`)
    .join(', ');
  return `Project '${project.name}' (${project.id}) — assets: ${assetCount}, ${trackSummaries}`;
}
