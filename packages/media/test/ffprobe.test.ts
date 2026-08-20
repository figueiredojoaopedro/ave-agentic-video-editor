import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probeFile, MediaProbeError } from '../src/ffprobe.js';
import { generateFixtureMedia, type FixtureMedia } from './fixtures.js';

describe('probeFile', () => {
  let fixture: FixtureMedia;
  beforeAll(async () => {
    fixture = await generateFixtureMedia();
  });
  afterAll(() => {
    fixture?.cleanup();
  });

  it('probes an A/V fixture and reports duration, video, and audio', async () => {
    const info = await probeFile(fixture.avPath);
    expect(info.path).toBe(fixture.avPath);
    expect(info.hasVideo).toBe(true);
    expect(info.hasAudio).toBe(true);
    expect(info.videoStream?.width).toBe(320);
    expect(info.videoStream?.height).toBe(240);
    expect(info.durationUs).toBeGreaterThan(900_000);
    expect(info.durationUs).toBeLessThan(1_100_000);
  });

  it('probes an audio-only fixture', async () => {
    const info = await probeFile(fixture.audioPath);
    expect(info.hasAudio).toBe(true);
    expect(info.hasVideo).toBe(false);
    expect(info.durationUs).toBeGreaterThan(900_000);
    expect(info.durationUs).toBeLessThan(1_100_000);
  });

  it('rejects a missing file with MediaProbeError', async () => {
    await expect(probeFile(join(tmpdir(), 'does-not-exist-12345.mp4'))).rejects.toBeInstanceOf(MediaProbeError);
  });
});
