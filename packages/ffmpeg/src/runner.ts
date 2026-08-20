import { spawn } from 'node:child_process';

export interface RunOptions {
  ffmpegPath?: string;
  timeoutMs?: number;
  cwd?: string;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly stderr?: string,
    public readonly exitCode?: number,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function runFfmpeg(args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const child = spawn(ffmpegPath, args, {
      cwd: options.cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new FfmpegError(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') {
        reject(new FfmpegError(`ffmpeg executable not found: ${ffmpegPath}`));
      } else {
        reject(new FfmpegError(`failed to run ffmpeg: ${error.message}`, stderr));
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new FfmpegError(`ffmpeg exited with code ${String(code)}`, stderr, code ?? undefined));
        return;
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
