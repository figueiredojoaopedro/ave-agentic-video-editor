import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AIProvider } from '@agentic-video-editor/ai-providers';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AIService } from '../src/ai-service.js';
import { createSecretStore } from '../src/secure-store.js';
import { createStore } from '../src/store.js';
import { generateFixtureMedia, type FixtureMedia } from './fixtures.js';

describe('AI end-to-end', () => {
  let fixture: FixtureMedia;
  let dataDir: string;
  let app: ReturnType<typeof createApp>;
  let projectId: string;

  beforeAll(async () => {
    fixture = await generateFixtureMedia();
    dataDir = mkdtempSync(join(tmpdir(), 'ave-ai-e2e-'));

    // A fake provider that knows the clip id via a closure and scripted two turns:
    // 1) splitClip at 400ms, 2) final summary.
    let knownClipId = '';
    let calls = 0;
    const provider: AIProvider = {
      id: 'fake',
      name: 'Fake',
      async generate() {
        calls += 1;
        if (calls === 1) {
          return {
            content: 'Splitting the first clip.',
            toolCalls: [
              { id: 'call_1', name: 'splitClip', arguments: JSON.stringify({ clipId: knownClipId, atUs: 400_000 }) },
            ],
          };
        }
        return { content: 'Done. Split at 400ms.', toolCalls: [] };
      },
    };

    const ai = new AIService({
      secretStore: createSecretStore({ filePath: join(dataDir, 'secrets.json') }),
      providerFactory: { create: () => provider },
    });
    app = createApp({ store: createStore(), dataDir, ai });

    // Create a project and import the fixture so a clip exists.
    const created = await request(app).post('/api/projects').send({ name: 'AI E2E' }).expect(201);
    projectId = created.body.id as string;
    const imported = await request(app).post('/api/import').send({ path: fixture.avPath }).expect(201);
    knownClipId = imported.body.clipId as string;

    // Configure the provider (BYOM): model + endpoint + api key.
    await request(app)
      .post('/api/ai/config')
      .send({ providerId: 'fake', model: 'fake-model', endpoint: 'https://api.example.com/v1', apiKey: 'sk-test' })
      .expect(200);
  });

  afterAll(() => {
    fixture.cleanup();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function videoClips(project: { timeline: { tracks: Array<{ kind: string; clips: Array<{ timelineStartUs: number; timelineEndUs: number }> }> } }) {
    const track = project.timeline.tracks.find((t) => t.kind === 'video');
    if (!track) throw new Error('no video track');
    return track.clips;
  }

  it('a configured model can request an edit and the timeline changes through the same operation system', async () => {
    // 1. Send a chat request; the model calls splitClip.
    const chat = await request(app)
      .post('/api/ai/chat')
      .send({ projectId, message: 'Split the first clip at 400ms' })
      .expect(200);
    expect(chat.body.ok).toBe(true);
    expect(chat.body.appliedOperations).toEqual(['splitClip']);
    expect(chat.body.response).toContain('Done');

    const afterChat = chat.body.project;
    const clips = videoClips(afterChat);
    expect(clips).toHaveLength(2);
    expect(clips[0]!.timelineEndUs).toBe(400_000);
    expect(clips[1]!.timelineStartUs).toBe(400_000);

    // 2. The AI edit is a normal history entry: undo via the HUMAN endpoint reverts it.
    const undone = await request(app).post(`/api/projects/${projectId}/undo`).expect(200);
    expect(videoClips(undone.body.project)).toHaveLength(1);

    // 3. Redo via the human endpoint replays it.
    const redone = await request(app).post(`/api/projects/${projectId}/redo`).expect(200);
    expect(videoClips(redone.body.project)).toHaveLength(2);
  });
});
