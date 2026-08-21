import cors from 'cors';
import express from 'express';
import { basename, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createId, type Asset, type Clip, type Project } from '@agentic-video-editor/editor-core';
import { renderProject, RenderError } from '@agentic-video-editor/ffmpeg';
import { MediaProbeError, probeFile } from '@agentic-video-editor/media';
import {
  applyOperationToStore,
  createProjectInStore,
  createStore,
  getProjectFromStore,
  loadProjectFromDisk,
  redoInStore,
  saveProjectToDisk,
  undoInStore,
  type ProjectStore,
} from './store.js';

export const API_PREFIX = '/api';

export interface AppOptions {
  store?: ProjectStore;
  dataDir?: string;
}

const NameSchema = z.object({ name: z.string().min(1) });
const PathSchema = z.object({ path: z.string().min(1) });

export function createApp(options: AppOptions = {}): express.Express {
  const store = options.store ?? createStore();
  const dataDir =
    options.dataDir ?? fileURLToPath(new URL('../.data/projects', import.meta.url));

  const ALLOWED_ORIGINS = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'tauri://localhost',
    'http://tauri.localhost',
  ];

  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json({ limit: '2mb' }));

  app.get(`${API_PREFIX}/health`, (_req, res) => {
    res.json({ ok: true, service: 'desktop-backend' });
  });

  app.post(`${API_PREFIX}/projects`, (req, res) => {
    const parsed = NameSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, errors: [{ code: 'INVALID_REQUEST', message: 'name is required' }] });
      return;
    }
    const project = createProjectInStore(store, parsed.data.name);
    res.status(201).json({ ok: true, id: project.id, project });
  });

  app.get(`${API_PREFIX}/projects/:id`, (req, res) => {
    const project = getProjectFromStore(store, req.params.id);
    if (!project) {
      res.status(404).json({ ok: false, errors: [{ code: 'PROJECT_NOT_FOUND', message: `project not found: ${req.params.id}` }] });
      return;
    }
    res.json({ ok: true, project });
  });

  app.post(`${API_PREFIX}/projects/:id/operations`, (req, res) => {
    const outcome = applyOperationToStore(store, req.params.id, (req.body ?? {}).operation);
    if (!outcome.ok) {
      res.status(400).json({ ok: false, errors: outcome.errors });
      return;
    }
    res.json({ ok: true, project: outcome.project });
  });

  app.post(`${API_PREFIX}/projects/:id/undo`, (req, res) => {
    const project = undoInStore(store, req.params.id);
    if (!project) {
      res.status(404).json({ ok: false, errors: [{ code: 'PROJECT_NOT_FOUND', message: `project not found: ${req.params.id}` }] });
      return;
    }
    res.json({ ok: true, project });
  });

  app.post(`${API_PREFIX}/projects/:id/redo`, (req, res) => {
    const project = redoInStore(store, req.params.id);
    if (!project) {
      res.status(404).json({ ok: false, errors: [{ code: 'PROJECT_NOT_FOUND', message: `project not found: ${req.params.id}` }] });
      return;
    }
    res.json({ ok: true, project });
  });

  app.post(`${API_PREFIX}/projects/:id/save`, async (req, res) => {
    try {
      const filePath = await saveProjectToDisk(store, req.params.id, dataDir);
      res.json({ ok: true, path: filePath });
    } catch (error) {
      res.status(500).json({ ok: false, errors: [{ code: 'SAVE_FAILED', message: toMessage(error) }] });
    }
  });

  app.post(`${API_PREFIX}/load`, async (req, res) => {
    const parsed = PathSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, errors: [{ code: 'INVALID_REQUEST', message: 'path is required' }] });
      return;
    }
    try {
      const project = await loadProjectFromDisk(store, parsed.data.path);
      res.json({ ok: true, id: project.id, project });
    } catch (error) {
      res.status(400).json({ ok: false, errors: [{ code: 'LOAD_FAILED', message: toMessage(error) }] });
    }
  });

  app.post(`${API_PREFIX}/import`, async (req, res) => {
    const parsed = PathSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, errors: [{ code: 'INVALID_REQUEST', message: 'path is required' }] });
      return;
    }
    const filePath = parsed.data.path;
    try {
      const info = await probeFile(filePath);
      if (!info.hasVideo && !info.hasAudio) {
        res.status(400).json({ ok: false, errors: [{ code: 'NO_MEDIA_STREAMS', message: 'file has no audio or video streams' }] });
        return;
      }
      const target = getFirstProject(store);
      if (!target) {
        res.status(400).json({ ok: false, errors: [{ code: 'NO_PROJECT', message: 'create a project before importing' }] });
        return;
      }
      const targetId = target.id;
      const asset: Asset = {
        id: createId('asset'),
        name: basename(filePath),
        path: filePath,
        kind: info.hasVideo ? 'video' : 'audio',
        durationUs: info.durationUs,
        width: info.videoStream?.width,
        height: info.videoStream?.height,
        metadata: {},
      };
      let outcome = applyOperationToStore(store, targetId, { type: 'addAsset', asset });
      if (!outcome.ok || !outcome.project) {
        res.status(400).json({ ok: false, errors: outcome.errors });
        return;
      }
      const trackId = outcome.project.timeline.tracks.find((track) => track.kind === asset.kind)?.id;
      if (!trackId) {
        res.status(400).json({ ok: false, errors: [{ code: 'NO_TRACK', message: `no ${asset.kind} track available` }] });
        return;
      }
      const clip: Clip = {
        id: createId('clip'),
        assetId: asset.id,
        name: asset.name,
        sourceStartUs: 0,
        sourceEndUs: info.durationUs,
        timelineStartUs: 0,
        timelineEndUs: info.durationUs,
        muted: false,
        volume: 1,
      };
      outcome = applyOperationToStore(store, targetId, { type: 'addClip', trackId, clip });
      if (!outcome.ok || !outcome.project) {
        res.status(400).json({ ok: false, errors: outcome.errors });
        return;
      }
      res.status(201).json({ ok: true, assetId: asset.id, clipId: clip.id, project: outcome.project });
    } catch (error) {
      if (error instanceof MediaProbeError) {
        res.status(400).json({ ok: false, errors: [{ code: 'PROBE_FAILED', message: error.message }] });
        return;
      }
      res.status(500).json({ ok: false, errors: [{ code: 'IMPORT_FAILED', message: toMessage(error) }] });
    }
  });

  app.post(`${API_PREFIX}/projects/:id/render`, async (req, res) => {
    const project = getProjectFromStore(store, req.params.id);
    if (!project) {
      res.status(404).json({ ok: false, errors: [{ code: 'PROJECT_NOT_FOUND', message: `project not found: ${req.params.id}` }] });
      return;
    }
    try {
      const body = req.body ?? {};
      if (body.outputPath !== undefined) {
        if (typeof body.outputPath !== 'string' || !isPathInsideTempDir(body.outputPath)) {
          res.status(400).json({
            ok: false,
            errors: [{ code: 'INVALID_OUTPUT_PATH', message: 'outputPath must be an absolute path inside the system temp directory' }],
          });
          return;
        }
      }
      const result = await renderProject(project, {
        ...(typeof body.outputPath === 'string' ? { outputPath: body.outputPath } : {}),
        ...(typeof body.width === 'number' ? { width: body.width } : {}),
        ...(typeof body.height === 'number' ? { height: body.height } : {}),
      });
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({ ok: false, errors: [{ code: 'RENDER_FAILED', message: toMessage(error) }] });
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ ok: false, errors: [{ code: 'INTERNAL', message: toMessage(error) }] });
  });

  return app;
}

function isPathInsideTempDir(filePath: string): boolean {
  if (!isAbsolute(filePath)) return false;
  const base = tmpdir().toLowerCase().replace(/[\\/]+$/, '');
  const lower = filePath.toLowerCase();
  return lower.startsWith(`${base}\\`) || lower.startsWith(`${base}/`);
}

function getFirstProject(store: ProjectStore): Project | undefined {
  for (const state of store.states.values()) {
    return getProjectFromStore(store, state.base.id);
  }
  return undefined;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
