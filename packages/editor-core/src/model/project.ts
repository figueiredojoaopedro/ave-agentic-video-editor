import { z } from 'zod';
import { AssetSchema } from './asset.js';
import { TimelineSchema } from './timeline.js';

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    assets: z.record(z.string(), AssetSchema),
    timeline: TimelineSchema,
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((project, ctx) => {
    for (const key of Object.keys(project.assets)) {
      if (key !== project.assets[key]!.id) {
        ctx.addIssue({ code: 'custom', message: `asset key ${key} does not match asset id`, path: ['assets'] });
      }
    }
    const knownAssets = new Set(Object.keys(project.assets));
    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        if (!knownAssets.has(clip.assetId)) {
          ctx.addIssue({
            code: 'custom',
            message: `clip ${clip.id} references missing asset ${clip.assetId}`,
            path: ['timeline'],
          });
        }
      }
    }
  });

export type Project = z.infer<typeof ProjectSchema>;
