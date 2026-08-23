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

describe('AI endpoints', () => {
  let fixture: FixtureMedia;
  let dataDir: string;
  let app: ReturnType<typeof createApp>;
  let projectId: string;
  /** Read lazily by the scripted provider so the clip id is known after import. */
  let knownClipId = '';

  beforeAll(async () => {
    fixture = await generateFixtureMedia();
    dataDir = mkdtempSync(join(tmpdir(), 'ave-ai-'));
    const secretStore = createSecretStore({ filePath: join(dataDir, 'secrets.json') });
    let calls = 0;
    const provider: AIProvider = {
      id: 'fake',
      name: 'Fake',
      async generate() {
        calls += 1;
        if (calls === 1) {
          return {
            content: 'Splitting.',
            toolCalls: [{ id: 'call_1', name: 'splitClip', arguments: JSON.stringify({ clipId: knownClipId, atUs: 400_000 }) }],
          };
        }
        return { content: 'Done.', toolCalls: [] };
      },
    };
    const ai = new AIService({
      secretStore,
      providerFactory: { create: () => provider },
    });
    app = createApp({ store: createStore(), dataDir, ai });
  });

  afterAll(() => {
    fixture.cleanup();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns null config before configuration', async () => {
    const res = await request(app).get('/api/ai/config').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.config).toBeNull();
  });

  it('stores config and masks the api key', async () => {
    const res = await request(app)
      .post('/api/ai/config')
      .send({ providerId: 'fake', model: 'fake-model', endpoint: 'https://api.example.com/v1', apiKey: 'sk-super-secret' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.config.hasApiKey).toBe(true);
    expect('apiKey' in res.body.config).toBe(false);

    const fetched = await request(app).get('/api/ai/config').expect(200);
    expect(fetched.body.config.hasApiKey).toBe(true);
    expect(fetched.body.config.model).toBe('fake-model');
  });

  it('runs a chat that applies an edit through the same operation API', async () => {
    // Create project + import fixture so there is a clip on the video track.
    const created = await request(app).post('/api/projects').send({ name: 'AI Project' }).expect(201);
    projectId = created.body.id as string;
    const imported = await request(app).post('/api/import').send({ path: fixture.avPath }).expect(201);
    knownClipId = imported.body.clipId as string;

    const chat = await request(app)
      .post('/api/ai/chat')
      .send({ projectId, message: 'Split the first clip at 400ms' })
      .expect(200);
    expect(chat.body.ok).toBe(true);
    expect(chat.body.appliedOperations).toEqual(['splitClip']);
    const videoClips = chat.body.project.timeline.tracks.find((track: { kind: string }) => track.kind === 'video').clips;
    expect(videoClips).toHaveLength(2);
  });

  it('clears the AI configuration', async () => {
    const res = await request(app).delete('/api/ai/config').expect(200);
    expect(res.body.ok).toBe(true);
    const fetched = await request(app).get('/api/ai/config').expect(200);
    expect(fetched.body.config).toBeNull();
  });

  it('rejects chat when no provider is configured', async () => {
    const app2 = createApp({
      store: createStore(),
      dataDir,
      ai: new AIService({ secretStore: createSecretStore({ filePath: join(dataDir, 'unused-secrets.json') }) }),
    });
    const created = await request(app2).post('/api/projects').send({ name: 'X' }).expect(201);
    const res = await request(app2)
      .post('/api/ai/chat')
      .send({ projectId: created.body.id, message: 'hello' })
      .expect(400);
    expect(res.body.errors[0].code).toBe('AI_NOT_CONFIGURED');
  });
});
