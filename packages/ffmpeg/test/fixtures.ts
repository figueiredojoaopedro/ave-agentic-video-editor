import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FixtureMedia {
  /** 1 second, 320x240, H.264 + AAC, with video and audio streams */
  avPath: string;
  cleanup(): void;
}

export async function generateFixtureMedia(): Promise<FixtureMedia> {
  const dir = mkdtempSync(join(tmpdir(), 'ave-ffmpeg-fixture-'));
  const avPath = join(dir, 'fixture-av.mp4');
  await runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=1:size=320x240:rate=30',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-shortest',
    avPath,
  ]);
  return {
    avPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { windowsHide: true }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg failed: ${String(stderr)}`));
        return;
      }
      resolve();
    });
  });
}
