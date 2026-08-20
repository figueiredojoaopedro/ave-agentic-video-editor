import { z } from 'zod';

export const MediaStreamInfoSchema = z.object({
  index: z.number().int().nonnegative(),
  codecType: z.enum(['video', 'audio', 'data', 'subtitle', 'attachment']),
  codecName: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationUs: z.number().int().nonnegative().optional(),
  sampleRate: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
});

export type MediaStreamInfo = z.infer<typeof MediaStreamInfoSchema>;

export const MediaInfoSchema = z.object({
  path: z.string().min(1),
  formatName: z.string().optional(),
  durationUs: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative().optional(),
  streams: z.array(MediaStreamInfoSchema),
  videoStream: MediaStreamInfoSchema.optional(),
  audioStream: MediaStreamInfoSchema.optional(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
});

export type MediaInfo = z.infer<typeof MediaInfoSchema>;
