import type { Project } from '../model/index.js';
import { assetIdInUse, clipIdInUse, findClip, getAsset, getTrack, isTrackCompatible } from '../model/lookup.js';
import type { EditOperation } from './types.js';

export interface OperationError {
  code: string;
  message: string;
  path?: string[];
}

export type OperationResult =
  | { ok: true; errors: [] }
  | { ok: false; errors: OperationError[] };

function fail(code: string, message: string, path?: string[]): OperationResult {
  const error: OperationError = path === undefined ? { code, message } : { code, message, path };
  return { ok: false, errors: [error] };
}

function okResult(): OperationResult {
  return { ok: true, errors: [] };
}

export function validateOperation(project: Project, operation: EditOperation): OperationResult {
  switch (operation.type) {
    case 'addAsset':
      return validateAddAsset(project, operation);
    case 'addClip':
      return validateAddClip(project, operation);
    case 'splitClip':
      return validateSplitClip(project, operation);
    case 'trimClip':
      return validateTrimClip(project, operation);
    case 'deleteClip':
      return findClip(project, operation.clipId) ? okResult() : fail('CLIP_NOT_FOUND', `clip not found: ${operation.clipId}`);
    case 'moveClip':
      return findClip(project, operation.clipId) ? okResult() : fail('CLIP_NOT_FOUND', `clip not found: ${operation.clipId}`);
    case 'duplicateClip':
      return validateDuplicateClip(project, operation);
    case 'muteClip':
      return findClip(project, operation.clipId) ? okResult() : fail('CLIP_NOT_FOUND', `clip not found: ${operation.clipId}`);
    case 'setVolume':
      return findClip(project, operation.clipId) ? okResult() : fail('CLIP_NOT_FOUND', `clip not found: ${operation.clipId}`);
  }
}

function validateAddAsset(project: Project, op: Extract<EditOperation, { type: 'addAsset' }>): OperationResult {
  if (assetIdInUse(project, op.asset.id)) {
    return fail('ASSET_EXISTS', `asset already exists: ${op.asset.id}`);
  }
  return okResult();
}

function validateAddClip(project: Project, op: Extract<EditOperation, { type: 'addClip' }>): OperationResult {
  const track = getTrack(project, op.trackId);
  if (!track) return fail('TRACK_NOT_FOUND', `track not found: ${op.trackId}`);
  if (clipIdInUse(project, op.clip.id)) return fail('CLIP_EXISTS', `clip already exists: ${op.clip.id}`);
  const asset = getAsset(project, op.clip.assetId);
  if (!asset) return fail('ASSET_NOT_FOUND', `asset not found: ${op.clip.assetId}`);
  if (!isTrackCompatible(track.kind, asset.kind)) {
    return fail('TRACK_KIND_MISMATCH', `asset kind ${asset.kind} is not compatible with track kind ${track.kind}`);
  }
  if (asset.durationUs > 0 && op.clip.sourceEndUs > asset.durationUs) {
    return fail('SOURCE_RANGE_EXCEEDS_ASSET', `clip source range exceeds asset duration ${asset.durationUs}`);
  }
  return okResult();
}

function validateSplitClip(project: Project, op: Extract<EditOperation, { type: 'splitClip' }>): OperationResult {
  const location = findClip(project, op.clipId);
  if (!location) return fail('CLIP_NOT_FOUND', `clip not found: ${op.clipId}`);
  const { clip } = location;
  if (op.atUs <= clip.timelineStartUs || op.atUs >= clip.timelineEndUs) {
    return fail('SPLIT_OUT_OF_RANGE', `split point must be strictly inside (${clip.timelineStartUs}, ${clip.timelineEndUs})`);
  }
  if (clipIdInUse(project, op.newClipId)) return fail('CLIP_EXISTS', `clip already exists: ${op.newClipId}`);
  return okResult();
}

function validateTrimClip(project: Project, op: Extract<EditOperation, { type: 'trimClip' }>): OperationResult {
  const location = findClip(project, op.clipId);
  if (!location) return fail('CLIP_NOT_FOUND', `clip not found: ${op.clipId}`);
  const asset = getAsset(project, location.clip.assetId);
  if (asset && asset.durationUs > 0 && op.sourceEndUs > asset.durationUs) {
    return fail('TRIM_OUT_OF_RANGE', `trim end exceeds asset duration ${asset.durationUs}`);
  }
  return okResult();
}

function validateDuplicateClip(project: Project, op: Extract<EditOperation, { type: 'duplicateClip' }>): OperationResult {
  if (!findClip(project, op.clipId)) return fail('CLIP_NOT_FOUND', `clip not found: ${op.clipId}`);
  if (clipIdInUse(project, op.newClipId)) return fail('CLIP_EXISTS', `clip already exists: ${op.newClipId}`);
  return okResult();
}
