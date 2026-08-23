import { createHash } from 'node:crypto';
import type { RenderManifest } from './ir.js';

/** Canonical, deterministic JSON serialization of a manifest (stable key order). */
export function canonicalManifestJson(manifest: RenderManifest): string {
  return JSON.stringify({
    version: manifest.version,
    output: {
      width: manifest.output.width,
      height: manifest.output.height,
      frameRate: manifest.output.frameRate,
    },
    segments: manifest.segments.map((segment) => ({
      sourcePath: segment.sourcePath,
      sourceStartUs: segment.sourceStartUs,
      sourceEndUs: segment.sourceEndUs,
      timelineStartUs: segment.timelineStartUs,
      timelineEndUs: segment.timelineEndUs,
      muted: segment.muted,
      volume: segment.volume,
    })),
  });
}

/** SHA-256 of the canonical manifest JSON — the render cache key. */
export function manifestHash(manifest: RenderManifest): string {
  return createHash('sha256').update(canonicalManifestJson(manifest)).digest('hex');
}
