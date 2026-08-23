import { access, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface RenderCacheOptions {
  cacheDir: string;
}

/** A manifest-hash-keyed render cache. Cached files are named <hash>.mp4 inside cacheDir. */
export class RenderCache {
  readonly cacheDir: string;

  constructor(options: RenderCacheOptions) {
    this.cacheDir = options.cacheDir;
  }

  resolvePath(manifestHash: string): string {
    return join(this.cacheDir, `${manifestHash}.mp4`);
  }

  async has(manifestHash: string): Promise<boolean> {
    try {
      await access(this.resolvePath(manifestHash));
      return true;
    } catch {
      return false;
    }
  }

  async put(manifestHash: string, sourcePath: string): Promise<string> {
    await mkdir(this.cacheDir, { recursive: true });
    const target = this.resolvePath(manifestHash);
    await copyFile(sourcePath, target);
    return target;
  }
}
