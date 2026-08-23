import type { RenderManifest } from './ir.js';

export function buildFfmpegArgs(manifest: RenderManifest, outputPath: string): string[] {
  const width = manifest.output.width;
  const height = manifest.output.height;
  const frameRate = manifest.output.frameRate;

  const args: string[] = [];
  const filterParts: string[] = [];
  const concatInputs: string[] = [];
  let labelIndex = 0;

  manifest.segments.forEach((segment, inputIndex) => {
    if (inputIndex > 0) {
      const previous = manifest.segments[inputIndex - 1]!;
      const gapUs = segment.timelineStartUs - previous.timelineEndUs;
      if (gapUs > 0) {
        filterParts.push(
          `color=c=black:s=${width}x${height}:d=${toSeconds(gapUs)}:r=${frameRate},format=yuv420p[v${labelIndex}]`,
          `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${toSeconds(gapUs)},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${labelIndex}]`,
        );
        concatInputs.push(`[v${labelIndex}][a${labelIndex}]`);
        labelIndex += 1;
      }
    }

    args.push('-i', segment.sourcePath);
    const sourceStart = toSeconds(segment.sourceStartUs);
    const sourceEnd = toSeconds(segment.sourceEndUs);
    const volume = segment.muted ? '0.0' : segment.volume.toFixed(4);
    filterParts.push(
      `[${inputIndex}:v]trim=start=${sourceStart}:end=${sourceEnd},setpts=PTS-STARTPTS,fps=${frameRate},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v${labelIndex}]`,
      `[${inputIndex}:a]atrim=start=${sourceStart}:end=${sourceEnd},asetpts=PTS-STARTPTS,volume=${volume},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${labelIndex}]`,
    );
    concatInputs.push(`[v${labelIndex}][a${labelIndex}]`);
    labelIndex += 1;
  });

  filterParts.push(`${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=1[vout][aout]`);

  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', '[vout]', '-map', '[aout]');
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  args.push('-c:a', 'aac');
  args.push('-y', outputPath);
  return args;
}

function toSeconds(us: number): string {
  return (us / 1_000_000).toFixed(6);
}
