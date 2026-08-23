import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { generateFixtureMedia, type FixtureMedia } from './fixtures.js';

describe('end-to-end editing path', () => {
  let fixture: FixtureMedia;
  let dataDir: string;
  let app: ReturnType<typeof createApp>;
  let projectId: string;

  async function waitForJob(app: ReturnType<typeof createApp>, jobId: string, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await request(app).get(`/api/jobs/${jobId}`).expect(200);
      const status = res.body.job.status as string;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') return res.body.job;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`job ${jobId} did not finish within ${timeoutMs}ms`);
  }

  beforeAll(async () => {
    fixture = await generateFixtureMedia();
    dataDir = mkdtempSync(join(tmpdir(), 'ave-e2e-'));
    app = createApp({ store: createStore(), dataDir });
  });

  afterAll(() => {
    fixture.cleanup();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function videoTrackClips(body: { project: { timeline: { tracks: Array<{ kind: string; clips: unknown[] }> } } }) {
    const track = body.project.timeline.tracks.find((t) => t.kind === 'video');
    if (!track) throw new Error('no video track');
    return track.clips;
  }

  it('imports, splits, deletes, saves, reloads, and renders', async () => {
    // 1. Create a project
    const created = await request(app).post('/api/projects').send({ name: 'E2E' }).expect(201);
    projectId = created.body.id as string;

    // 2. Import the fixture asset
    const imported = await request(app).post('/api/import').send({ path: fixture.avPath }).expect(201);
    expect(videoTrackClips(imported.body)).toHaveLength(1);

    // 3. Split the imported clip at 400ms
    const split = await request(app)
      .post(`/api/projects/${projectId}/operations`)
      .send({ operation: { type: 'splitClip', clipId: imported.body.clipId, atUs: 400_000, newClipId: 'clip_b' } })
      .expect(200);
    expect(videoTrackClips(split.body)).toHaveLength(2);

    // 4. Delete the right segment
    const deleted = await request(app)
      .post(`/api/projects/${projectId}/operations`)
      .send({ operation: { type: 'deleteClip', clipId: 'clip_b' } })
      .expect(200);
    const remaining = videoTrackClips(deleted.body);
    expect(remaining).toHaveLength(1);
    expect((remaining[0] as { timelineEndUs: number }).timelineEndUs).toBe(400_000);

    // 5. Save the project to disk
    const saved = await request(app).post(`/api/projects/${projectId}/save`).expect(200);
    const savedPath = saved.body.path as string;
    expect(existsSync(savedPath)).toBe(true);

    // 6. Reload — the restored project must equal the saved project
    const loaded = await request(app).post('/api/load').send({ path: savedPath }).expect(200);
    expect(loaded.body.project).toEqual(deleted.body.project);
    const reloadedId = loaded.body.id as string;

    // 7. Render the reloaded project and verify the output against the timeline state
    const rendered = await request(app)
      .post(`/api/projects/${reloadedId}/render`)
      .send({ width: 320, height: 240 })
      .expect(202);
    const jobId = rendered.body.jobId as string;
    const job = await waitForJob(app, jobId);
    expect(job.status).toBe('completed');
    expect(job.result.hasVideo).toBe(true);
    expect(job.result.hasAudio).toBe(true);
    expect(Math.abs(job.result.durationUs - 400_000)).toBeLessThanOrEqual(200_000);
  });
});
