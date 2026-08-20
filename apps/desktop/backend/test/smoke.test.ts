import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('backend app', () => {
  it('serves /api/health', async () => {
    const res = await request(createApp()).get('/api/health').expect(200);
    expect(res.body).toEqual({ ok: true, service: 'desktop-backend' });
  });
});
