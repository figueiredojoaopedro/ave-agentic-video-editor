import cors from 'cors';
import express from 'express';

export const API_PREFIX = '/api';

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get(`${API_PREFIX}/health`, (_req, res) => {
    res.json({ ok: true, service: 'desktop-backend' });
  });

  return app;
}
