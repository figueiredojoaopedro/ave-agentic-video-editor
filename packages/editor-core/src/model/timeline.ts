import { z } from 'zod';
import { TrackSchema } from './track.js';

export const TimelineSchema = z
  .object({
    id: z.string().min(1),
    tracks: z.array(TrackSchema),
  })
  .superRefine((timeline, ctx) => {
    const trackIds = new Set<string>();
    for (const track of timeline.tracks) {
      if (trackIds.has(track.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate track id: ${track.id}`, path: ['tracks'] });
      }
      trackIds.add(track.id);
    }
    const clipIds = new Set<string>();
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (clipIds.has(clip.id)) {
          ctx.addIssue({ code: 'custom', message: `duplicate clip id: ${clip.id}`, path: ['tracks'] });
        }
        clipIds.add(clip.id);
      }
    }
  });

export type Timeline = z.infer<typeof TimelineSchema>;
