import { mkdtempSync, rmSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { generateFixtureMedia, type FixtureMedia } from './fixtures.js';

function findClip(project: unknown, clipId: string): { id: string; muted: boolean } | undefined {
  const tracks = (project as {
    timeline: { tracks: Array<{ clips: Array<{ id: string; muted: boolean }> }> };
  }).timeline.tracks;
  for (const track of tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return clip;
  }
  return undefined;
}

describe('backend API', () => {
  let fixture: FixtureMedia;
  let dataDir: string;
  let app: ReturnType<typeof createApp>;
  let projectId: string;
  let importedClipId: string;

  beforeAll(async () => {
    fixture = await generateFixtureMedia();
    dataDir = mkdtempSync(join(tmpdir(), 'ave-backend-data-'));
    app = createApp({ store: createStore(), dataDir });
  });

  afterAll(() => {
    fixture.cleanup();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('creates a project with video and audio tracks', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'My Project' }).expect(201);
    expect(res.body.ok).toBe(true);
    projectId = res.body.id;
    const kinds = res.body.project.timeline.tracks.map((track: { kind: string }) => track.kind);
    expect(kinds).toContain('video');
    expect(kinds).toContain('audio');
  });

  it('returns 404 for an unknown project', async () => {
    await request(app).get('/api/projects/does-not-exist').expect(404);
  });

  it('imports a fixture asset as a clip on the video track', async () => {
    const res = await request(app).post('/api/import').send({ path: fixture.avPath }).expect(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.assetId).toBeTruthy();
    expect(res.body.clipId).toBeTruthy();
    importedClipId = res.body.clipId as string;
    const videoClips = res.body.project.timeline.tracks.find(
      (track: { kind: string }) => track.kind === 'video',
    ).clips;
    expect(videoClips).toHaveLength(1);
    expect(videoClips[0].assetId).toBe(res.body.assetId);
  });

  it('applies an operation and rejects an invalid one', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/operations`)
      .send({ operation: { type: 'muteClip', clipId: 'missing', muted: true } })
      .expect(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.errors[0].code).toBe('CLIP_NOT_FOUND');
  });

  it('undoes and redoes operations', async () => {
    expect(importedClipId).toBeTruthy();

    await request(app)
      .post(`/api/projects/${projectId}/operations`)
      .send({ operation: { type: 'muteClip', clipId: importedClipId, muted: true } })
      .expect(200);

    const mutedRes = await request(app).get(`/api/projects/${projectId}`).expect(200);
    expect(mutedRes.body.ok).toBe(true);
    expect(findClip(mutedRes.body.project, importedClipId)?.muted).toBe(true);

    const undoRes = await request(app).post(`/api/projects/${projectId}/undo`).expect(200);
    expect(undoRes.body.ok).toBe(true);
    expect(findClip(undoRes.body.project, importedClipId)?.muted).toBe(false);

    const redoRes = await request(app).post(`/api/projects/${projectId}/redo`).expect(200);
    expect(redoRes.body.ok).toBe(true);
    expect(findClip(redoRes.body.project, importedClipId)?.muted).toBe(true);
  });

  it('saves and reloads a project', async () => {
    const saveRes = await request(app).post(`/api/projects/${projectId}/save`).expect(200);
    expect(saveRes.body.ok).toBe(true);
    const savedPath = saveRes.body.path as string;
    expect(existsSync(savedPath)).toBe(true);

    const loadRes = await request(app).post('/api/load').send({ path: savedPath }).expect(200);
    expect(loadRes.body.ok).toBe(true);
    expect(loadRes.body.project.timeline.tracks.map((t: { kind: string }) => t.kind)).toContain('video');
  });

  it('rejects import of a missing file', async () => {
    await request(app).post('/api/import').send({ path: join(tmpdir(), 'nope-missing.mp4') }).expect(400);
  });

  it('renders the project to an output file', async () => {
    const outPath = join(dataDir, 'render-output.mp4');
    const res = await request(app)
      .post(`/api/projects/${projectId}/render`)
      .send({ outputPath: outPath, width: 320, height: 240 })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.hasVideo).toBe(true);
    expect(res.body.result.hasAudio).toBe(true);
    expect(existsSync(outPath)).toBe(true);
  });

  it('does not set CORS headers for disallowed origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the frontend dev origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://127.0.0.1:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  it('rejects render output paths outside the temp directory', async () => {
    await request(app)
      .post(`/api/projects/${projectId}/render`)
      .send({ outputPath: 'C:\\Windows\\evil.mp4' })
      .expect(400);
  });
});
