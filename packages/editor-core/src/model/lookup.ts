import type { Asset, Clip, Project, Track, TrackKind } from './index.js';
import type { AssetKind } from './asset.js';

export interface ClipLocation {
  trackIndex: number;
  track: Track;
  clipIndex: number;
  clip: Clip;
}

export function findClip(project: Project, clipId: string): ClipLocation | undefined {
  for (let trackIndex = 0; trackIndex < project.timeline.tracks.length; trackIndex += 1) {
    const track = project.timeline.tracks[trackIndex]!;
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex !== -1) {
      return { trackIndex, track, clipIndex, clip: track.clips[clipIndex]! };
    }
  }
  return undefined;
}

export function getTrack(project: Project, trackId: string): Track | undefined {
  return project.timeline.tracks.find((track) => track.id === trackId);
}

export function getAsset(project: Project, assetId: string): Asset | undefined {
  return project.assets[assetId];
}

export function clipIdInUse(project: Project, clipId: string): boolean {
  return findClip(project, clipId) !== undefined;
}

export function assetIdInUse(project: Project, assetId: string): boolean {
  return assetId in project.assets;
}

export function isTrackCompatible(trackKind: TrackKind, assetKind: AssetKind): boolean {
  if (trackKind === 'video') return assetKind === 'video' || assetKind === 'image';
  return assetKind === 'audio';
}

export function sortTrackClips(track: Track): Track {
  return {
    ...track,
    clips: [...track.clips].sort((a, b) => a.timelineStartUs - b.timelineStartUs),
  };
}
