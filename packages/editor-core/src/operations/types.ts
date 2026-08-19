import { z } from 'zod';
import { AssetSchema, ClipSchema } from '../model/index.js';

export const AddAssetOperationSchema = z.object({
  type: z.literal('addAsset'),
  asset: AssetSchema,
});

export const AddClipOperationSchema = z.object({
  type: z.literal('addClip'),
  trackId: z.string().min(1),
  clip: ClipSchema,
});

export const SplitClipOperationSchema = z
  .object({
    type: z.literal('splitClip'),
    clipId: z.string().min(1),
    atUs: z.number().int().nonnegative(),
    newClipId: z.string().min(1),
  })
  .superRefine((op, ctx) => {
    if (op.newClipId === op.clipId) {
      ctx.addIssue({ code: 'custom', message: 'newClipId must differ from clipId', path: ['newClipId'] });
    }
  });

export const TrimClipOperationSchema = z
  .object({
    type: z.literal('trimClip'),
    clipId: z.string().min(1),
    sourceStartUs: z.number().int().nonnegative(),
    sourceEndUs: z.number().int().nonnegative(),
  })
  .superRefine((op, ctx) => {
    if (op.sourceStartUs >= op.sourceEndUs) {
      ctx.addIssue({ code: 'custom', message: 'sourceStartUs must be < sourceEndUs', path: ['sourceStartUs'] });
    }
  });

export const DeleteClipOperationSchema = z.object({
  type: z.literal('deleteClip'),
  clipId: z.string().min(1),
});

export const MoveClipOperationSchema = z.object({
  type: z.literal('moveClip'),
  clipId: z.string().min(1),
  timelineStartUs: z.number().int().nonnegative(),
});

export const DuplicateClipOperationSchema = z
  .object({
    type: z.literal('duplicateClip'),
    clipId: z.string().min(1),
    newClipId: z.string().min(1),
  })
  .superRefine((op, ctx) => {
    if (op.newClipId === op.clipId) {
      ctx.addIssue({ code: 'custom', message: 'newClipId must differ from clipId', path: ['newClipId'] });
    }
  });

export const MuteClipOperationSchema = z.object({
  type: z.literal('muteClip'),
  clipId: z.string().min(1),
  muted: z.boolean(),
});

export const SetVolumeOperationSchema = z.object({
  type: z.literal('setVolume'),
  clipId: z.string().min(1),
  volume: z.number().min(0).max(1),
});

export const EditOperationSchema = z.discriminatedUnion('type', [
  AddAssetOperationSchema,
  AddClipOperationSchema,
  SplitClipOperationSchema,
  TrimClipOperationSchema,
  DeleteClipOperationSchema,
  MoveClipOperationSchema,
  DuplicateClipOperationSchema,
  MuteClipOperationSchema,
  SetVolumeOperationSchema,
]);

export type EditOperation = z.infer<typeof EditOperationSchema>;

export const OPERATION_TYPES = [
  'addAsset',
  'addClip',
  'splitClip',
  'trimClip',
  'deleteClip',
  'moveClip',
  'duplicateClip',
  'muteClip',
  'setVolume',
] as const;

export function isEditOperation(value: unknown): value is EditOperation {
  return EditOperationSchema.safeParse(value).success;
}
