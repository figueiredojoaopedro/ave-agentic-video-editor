import { z } from 'zod';

export const ClipSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    name: z.string(),
    sourceStartUs: z.number().int().nonnegative(),
    sourceEndUs: z.number().int().nonnegative(),
    timelineStartUs: z.number().int().nonnegative(),
    timelineEndUs: z.number().int().nonnegative(),
    muted: z.boolean().default(false),
    volume: z.number().min(0).max(1).default(1),
  })
  .superRefine((clip, ctx) => {
    if (clip.sourceEndUs <= clip.sourceStartUs) {
      ctx.addIssue({ code: 'custom', message: 'sourceEndUs must be > sourceStartUs', path: ['sourceEndUs'] });
    }
    if (clip.timelineEndUs <= clip.timelineStartUs) {
      ctx.addIssue({ code: 'custom', message: 'timelineEndUs must be > timelineStartUs', path: ['timelineEndUs'] });
    }
    if (clip.sourceEndUs - clip.sourceStartUs !== clip.timelineEndUs - clip.timelineStartUs) {
      ctx.addIssue({
        code: 'custom',
        message: 'source duration and timeline duration must be equal',
        path: ['timelineEndUs'],
      });
    }
  });

export type Clip = z.infer<typeof ClipSchema>;
