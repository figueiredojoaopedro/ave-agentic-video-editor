import { spawn } from 'node:child_process';

export interface RunOptions {
  ffmpegPath?: string;
  timeoutMs?: number;
  cwd?: string;
  /** Called with ffmpeg's out_time_us whenever -progress pipe:1 is used and a line is parsed. */
  onProgress?: (outTimeUs: number) => void;
  /** Aborting the signal cancels the run (kills the child). */
  signal?: AbortSignal;
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

export class FfmpegCancelledError extends FfmpegError {
  constructor(stderr?: string) {
    super('ffmpeg was cancelled', stderr);
    this.name = 'FfmpegCancelledError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const SIGTERM_GRACE_MS = 3_000;

export function runFfmpeg(args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (options.signal?.aborted) {
      reject(new FfmpegCancelledError());
      return;
    }

    const child = spawn(ffmpegPath, args, {
      cwd: options.cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let cancelled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const onAbort = () => {
      cancelled = true;
      child.kill();
      killTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, SIGTERM_GRACE_MS);
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      cleanup();
      child.kill();
      reject(new FfmpegError(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (options.onProgress) {
        lineBuffer += chunk.toString('utf8');
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('out_time_us=')) {
            const value = Number(line.slice('out_time_us='.length));
            if (Number.isFinite(value) && value >= 0) {
              options.onProgress(value);
            }
          }
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', onAbort);
    };

    child.on('error', (error: NodeJS.ErrnoException) => {
      cleanup();
      if (cancelled) {
        reject(new FfmpegCancelledError(stderr));
        return;
      }
      if (error.code === 'ENOENT') {
        reject(new FfmpegError(`ffmpeg executable not found: ${ffmpegPath}`));
      } else {
        reject(new FfmpegError(`failed to run ffmpeg: ${error.message}`, stderr));
      }
    });
    child.on('close', (code) => {
      cleanup();
      if (cancelled) {
        reject(new FfmpegCancelledError(stderr));
        return;
      }
      if (code !== 0) {
        reject(new FfmpegError(`ffmpeg exited with code ${String(code)}`, stderr, code ?? undefined));
        return;
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
