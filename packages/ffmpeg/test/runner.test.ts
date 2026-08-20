import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FfmpegError, runFfmpeg } from '../src/runner.js';

describe('runFfmpeg', () => {
  const dirs: string[] = [];

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ave-runner-'));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs ffmpeg -version and returns its output', async () => {
    const result = await runFfmpeg(['-version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ffmpeg version');
  });

  it('encodes a tiny lavfi clip to a file', async () => {
    const dir = tempDir();
    const out = join(dir, 'out.mp4');
    const result = await runFfmpeg([
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=0.5:size=160x120:rate=15',
      '-pix_fmt', 'yuv420p',
      out,
    ]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(out)).toBe(true);
  });

  it('rejects a run against a missing input file with FfmpegError', async () => {
    const dir = tempDir();
    const out = join(dir, 'out.mp4');
    await expect(runFfmpeg(['-y', '-i', join(dir, 'nope.mp4'), out])).rejects.toBeInstanceOf(FfmpegError);
  });

  it('rejects when the ffmpeg executable is missing (ENOENT)', async () => {
    await expect(
      runFfmpeg(['-version'], { ffmpegPath: 'definitely-not-an-ffmpeg-binary' }),
    ).rejects.toBeInstanceOf(FfmpegError);
  });
});
