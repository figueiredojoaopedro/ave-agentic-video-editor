import type { EditOperation, Project } from '@agentic-video-editor/editor-core';

export interface RenderResult {
  outputPath: string;
  durationUs: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  path?: string[];
}

const BASE_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://127.0.0.1:43110';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok: boolean;
    errors?: ApiError[];
    [key: string]: unknown;
  };
  if (!response.ok || body.ok === false) {
    const errors = body.errors ?? [{ code: 'HTTP_ERROR', message: `HTTP ${response.status}` }];
    throw new ApiRequestError(response.status, errors);
  }
  return body as T;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly errors: ApiError[],
  ) {
    super(errors.map((error) => `${error.code}: ${error.message}`).join('; '));
    this.name = 'ApiRequestError';
  }
}

export const api = {
  createProject(name: string): Promise<{ id: string; project: Project }> {
    return request('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
  },

  getProject(id: string): Promise<{ project: Project }> {
    return request(`/api/projects/${id}`);
  },

  applyOperation(id: string, operation: EditOperation): Promise<{ project: Project }> {
    return request(`/api/projects/${id}/operations`, {
      method: 'POST',
      body: JSON.stringify({ operation }),
    });
  },

  undo(id: string): Promise<{ project: Project }> {
    return request(`/api/projects/${id}/undo`, { method: 'POST' });
  },

  redo(id: string): Promise<{ project: Project }> {
    return request(`/api/projects/${id}/redo`, { method: 'POST' });
  },

  saveProject(id: string): Promise<{ path: string }> {
    return request(`/api/projects/${id}/save`, { method: 'POST' });
  },

  loadProject(path: string): Promise<{ id: string; project: Project }> {
    return request('/api/load', { method: 'POST', body: JSON.stringify({ path }) });
  },

  importAsset(path: string): Promise<{ assetId: string; clipId: string; project: Project }> {
    return request('/api/import', { method: 'POST', body: JSON.stringify({ path }) });
  },

  renderProject(id: string, outputPath?: string): Promise<{ result: RenderResult }> {
    return request(`/api/projects/${id}/render`, {
      method: 'POST',
      body: JSON.stringify(outputPath === undefined ? {} : { outputPath }),
    });
  },

  getAiConfig(): Promise<{ config: PublicAIModelConfig | null }> {
    return request('/api/ai/config');
  },

  saveAiConfig(config: {
    providerId: string;
    model: string;
    endpoint?: string;
    apiKey?: string;
  }): Promise<{ config: PublicAIModelConfig }> {
    return request('/api/ai/config', { method: 'POST', body: JSON.stringify(config) });
  },

  aiChat(projectId: string, message: string): Promise<AiChatResult> {
    return request('/api/ai/chat', { method: 'POST', body: JSON.stringify({ projectId, message }) });
  },
};

export interface PublicAIModelConfig {
  providerId: string;
  model: string;
  endpoint?: string;
  organizationId?: string;
  hasApiKey: boolean;
}

export interface AiChatResult {
  response: string;
  appliedOperations: string[];
  project: Project;
}
