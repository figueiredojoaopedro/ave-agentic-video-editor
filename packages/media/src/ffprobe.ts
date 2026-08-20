import { spawn } from 'node:child_process';
import { MediaInfoSchema, type MediaInfo, type MediaStreamInfo } from './types.js';

export interface ProbeOptions {
  ffprobePath?: string;
  timeoutMs?: number;
}

export class MediaProbeError extends Error {
  constructor(
    message: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'MediaProbeError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function probeFile(path: string, options: ProbeOptions = {}): Promise<MediaInfo> {
  return new Promise<MediaInfo>((resolve, reject) => {
    const ffprobePath = options.ffprobePath ?? 'ffprobe';
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const child = spawn(
      ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      { windowsHide: true },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new MediaProbeError(`ffprobe timed out after ${timeoutMs}ms: ${path}`));
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
        reject(new MediaProbeError(`ffprobe executable not found: ${ffprobePath}`));
      } else {
        reject(new MediaProbeError(`failed to run ffprobe: ${error.message}`, stderr));
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new MediaProbeError(`ffprobe exited with code ${String(code)} for ${path}`, stderr));
        return;
      }
      try {
        const raw = JSON.parse(stdout) as RawProbeOutput;
        resolve(parseProbeOutput(raw, path));
      } catch (error) {
        reject(
          new MediaProbeError(
            `failed to parse ffprobe output for ${path}: ${error instanceof Error ? error.message : String(error)}`,
            stderr,
          ),
        );
      }
    });
  });
}

interface RawProbeOutput {
  format?: { format_name?: string; duration?: string; size?: string };
  streams?: RawProbeStream[];
}

interface RawProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  sample_rate?: string;
  channels?: number;
}

function toUs(seconds: string | undefined): number | undefined {
  if (seconds === undefined) return undefined;
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 1_000_000);
}

export function parseProbeOutput(raw: RawProbeOutput, path: string): MediaInfo {
  const streams: MediaStreamInfo[] = (raw.streams ?? []).map((stream, index) => {
    const durationUs = toUs(stream.duration);
    return {
      index: stream.index ?? index,
      codecType: (stream.codec_type ?? 'data') as MediaStreamInfo['codecType'],
      ...(stream.codec_name !== undefined ? { codecName: stream.codec_name } : {}),
      ...(stream.width !== undefined ? { width: stream.width } : {}),
      ...(stream.height !== undefined ? { height: stream.height } : {}),
      ...(durationUs !== undefined ? { durationUs } : {}),
      ...(stream.sample_rate !== undefined ? { sampleRate: Number(stream.sample_rate) } : {}),
      ...(stream.channels !== undefined ? { channels: stream.channels } : {}),
    };
  });

  const videoStream = streams.find((stream) => stream.codecType === 'video');
  const audioStream = streams.find((stream) => stream.codecType === 'audio');

  const durationUs = toUs(raw.format?.duration) ?? videoStream?.durationUs ?? audioStream?.durationUs ?? 0;

  const info: MediaInfo = {
    path,
    ...(raw.format?.format_name !== undefined ? { formatName: raw.format.format_name } : {}),
    durationUs,
    ...(raw.format?.size !== undefined ? { sizeBytes: Number(raw.format.size) } : {}),
    streams,
    ...(videoStream !== undefined ? { videoStream } : {}),
    ...(audioStream !== undefined ? { audioStream } : {}),
    hasVideo: videoStream !== undefined,
    hasAudio: audioStream !== undefined,
  };

  const parsed = MediaInfoSchema.safeParse(info);
  if (!parsed.success) {
    throw new MediaProbeError(`ffprobe output failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data;
}
