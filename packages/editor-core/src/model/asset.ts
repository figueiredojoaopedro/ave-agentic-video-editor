import { z } from 'zod';

export const AssetKindSchema = z.enum(['video', 'audio', 'image']);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  path: z.string().min(1),
  kind: AssetKindSchema,
  durationUs: z.number().int().nonnegative().default(0),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type Asset = z.infer<typeof AssetSchema>;
