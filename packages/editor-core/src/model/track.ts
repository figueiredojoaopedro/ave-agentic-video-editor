import { z } from 'zod';
import { ClipSchema } from './clip.js';

export const TrackKindSchema = z.enum(['video', 'audio']);
export type TrackKind = z.infer<typeof TrackKindSchema>;

export const TrackSchema = z.object({
  id: z.string().min(1),
  kind: TrackKindSchema,
  name: z.string(),
  clips: z.array(ClipSchema),
});

export type Track = z.infer<typeof TrackSchema>;
