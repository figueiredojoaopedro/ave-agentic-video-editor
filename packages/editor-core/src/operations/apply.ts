import type { Clip, Project, Track } from '../model/index.js';
import { findClip, getTrack, sortTrackClips } from '../model/lookup.js';
import type { EditOperation } from './types.js';

export class InvariantError extends Error {
  constructor(message: string) {
    super(`invariant: ${message}`);
    this.name = 'InvariantError';
  }
}

function replaceTrack(project: Project, trackIndex: number, track: Track): Project {
  const tracks = [...project.timeline.tracks];
  tracks[trackIndex] = track;
  return { ...project, timeline: { ...project.timeline, tracks } };
}

function locate(project: Project, clipId: string): { location: NonNullable<ReturnType<typeof findClip>>; project: Project } {
  const location = findClip(project, clipId);
  if (!location) throw new InvariantError(`clip not found: ${clipId}`);
  return { location, project };
}

export function applyOperation(project: Project, operation: EditOperation): Project {
  switch (operation.type) {
    case 'addAsset':
      return applyAddAsset(project, operation);
    case 'addClip':
      return applyAddClip(project, operation);
    case 'splitClip':
      return applySplitClip(project, operation);
    case 'trimClip':
      return applyTrimClip(project, operation);
    case 'deleteClip':
      return applyDeleteClip(project, operation);
    case 'moveClip':
      return applyMoveClip(project, operation);
    case 'duplicateClip':
      return applyDuplicateClip(project, operation);
    case 'muteClip':
      return applyMuteClip(project, operation);
    case 'setVolume':
      return applySetVolume(project, operation);
  }
}

export function applyAddAsset(project: Project, op: Extract<EditOperation, { type: 'addAsset' }>): Project {
  return { ...project, assets: { ...project.assets, [op.asset.id]: op.asset } };
}

export function applyAddClip(project: Project, op: Extract<EditOperation, { type: 'addClip' }>): Project {
  const track = getTrack(project, op.trackId);
  if (!track) throw new InvariantError(`track not found: ${op.trackId}`);
  const trackIndex = project.timeline.tracks.findIndex((t) => t.id === op.trackId);
  const nextTrack = sortTrackClips({ ...track, clips: [...track.clips, op.clip] });
  return replaceTrack(project, trackIndex, nextTrack);
}

export function applySplitClip(project: Project, op: Extract<EditOperation, { type: 'splitClip' }>): Project {
  const { location } = locate(project, op.clipId);
  const { clip, track, trackIndex, clipIndex } = location;
  const sourceAt = clip.sourceStartUs + (op.atUs - clip.timelineStartUs);
  const left: Clip = { ...clip, sourceEndUs: sourceAt, timelineEndUs: op.atUs };
  const right: Clip = {
    ...clip,
    id: op.newClipId,
    name: `${clip.name} (2)`,
    sourceStartUs: sourceAt,
    timelineStartUs: op.atUs,
  };
  const clips = [...track.clips];
  clips[clipIndex] = left;
  clips.splice(clipIndex + 1, 0, right);
  return replaceTrack(project, trackIndex, sortTrackClips({ ...track, clips }));
}

export function applyTrimClip(project: Project, op: Extract<EditOperation, { type: 'trimClip' }>): Project {
  const { location } = locate(project, op.clipId);
  const { clip, track, trackIndex, clipIndex } = location;
  const duration = op.sourceEndUs - op.sourceStartUs;
  const next: Clip = {
    ...clip,
    sourceStartUs: op.sourceStartUs,
    sourceEndUs: op.sourceEndUs,
    timelineEndUs: clip.timelineStartUs + duration,
  };
  const clips = [...track.clips];
  clips[clipIndex] = next;
  return replaceTrack(project, trackIndex, { ...track, clips });
}

export function applyDeleteClip(project: Project, op: Extract<EditOperation, { type: 'deleteClip' }>): Project {
  const { location } = locate(project, op.clipId);
  const { track, trackIndex, clipIndex } = location;
  const clips = [...track.clips];
  clips.splice(clipIndex, 1);
  return replaceTrack(project, trackIndex, { ...track, clips });
}

export function applyMoveClip(project: Project, op: Extract<EditOperation, { type: 'moveClip' }>): Project {
  const { location } = locate(project, op.clipId);
  const { clip, track, trackIndex, clipIndex } = location;
  const duration = clip.timelineEndUs - clip.timelineStartUs;
  const next: Clip = { ...clip, timelineStartUs: op.timelineStartUs, timelineEndUs: op.timelineStartUs + duration };
  const clips = [...track.clips];
  clips[clipIndex] = next;
  return replaceTrack(project, trackIndex, sortTrackClips({ ...track, clips }));
}

export function applyDuplicateClip(project: Project, op: Extract<EditOperation, { type: 'duplicateClip' }>): Project {
  const { location } = locate(project, op.clipId);
  const { clip, track, trackIndex } = location;
  const duration = clip.timelineEndUs - clip.timelineStartUs;
  const copy: Clip = {
    ...clip,
    id: op.newClipId,
    name: `${clip.name} (copy)`,
    timelineStartUs: clip.timelineEndUs,
    timelineEndUs: clip.timelineEndUs + duration,
  };
  const nextTrack = sortTrackClips({ ...track, clips: [...track.clips, copy] });
  return replaceTrack(project, trackIndex, nextTrack);
}

export function applyMuteClip(project: Project, op: Extract<EditOperation, { type: 'muteClip' }>): Project {
  const { location } = locate(project, op.clipId);
  const { clip, track, trackIndex, clipIndex } = location;
  const next: Clip = { ...clip, muted: op.muted };
  const clips = [...track.clips];
  clips[clipIndex] = next;
  return replaceTrack(project, trackIndex, { ...track, clips });
}

export function applySetVolume(project: Project, op: Extract<EditOperation, { type: 'setVolume' }>): Project {
  const { location } = locate(project, op.clipId);
  const { clip, track, trackIndex, clipIndex } = location;
  const next: Clip = { ...clip, volume: op.volume };
  const clips = [...track.clips];
  clips[clipIndex] = next;
  return replaceTrack(project, trackIndex, { ...track, clips });
}
