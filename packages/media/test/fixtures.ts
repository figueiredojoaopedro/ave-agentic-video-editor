import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FixtureMedia {
  /** 1 second, 320x240, H.264 + AAC, with video and audio streams */
  avPath: string;
  /** 1 second audio-only AAC */
  audioPath: string;
  cleanup(): void;
}

export async function generateFixtureMedia(): Promise<FixtureMedia> {
  const dir = mkdtempSync(join(tmpdir(), 'ave-fixture-'));
  const avPath = join(dir, 'fixture-av.mp4');
  const audioPath = join(dir, 'fixture-audio.m4a');

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

  await runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=1',
    '-c:a', 'aac',
    audioPath,
  ]);

  return {
    avPath,
    audioPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

async function runFfmpeg(args: string[]): Promise<void> {
  const child = spawn('ffmpeg', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const code = await new Promise<number | null>((resolve) => {
    child.on('error', () => resolve(null));
    child.on('close', (closeCode) => resolve(closeCode));
  });
  if (code !== 0) {
    throw new Error(`ffmpeg fixture generation failed with code ${String(code)}:\n${stderr}`);
  }
}
