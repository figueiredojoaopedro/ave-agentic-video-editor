import {
  applyOperation as applyEditorOperation,
  canRedo as editorCanRedo,
  canUndo as editorCanUndo,
  createProject as createEditorProject,
  deserializeProject,
  getProject,
  loadProject as loadEditorProject,
  redo,
  serializeProject,
  undo,
  type EditorState,
  type OperationError,
  type Project,
} from '@agentic-video-editor/editor-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ProjectStore {
  states: Map<string, EditorState>;
}

export function createStore(): ProjectStore {
  return { states: new Map() };
}

export interface ApplyOutcome {
  ok: boolean;
  errors?: OperationError[];
  project?: Project;
}

export function createProjectInStore(store: ProjectStore, name: string): Project {
  const state = createEditorProject(name);
  store.states.set(state.base.id, state);
  return getProject(state);
}

export function getProjectFromStore(store: ProjectStore, id: string): Project | undefined {
  const state = store.states.get(id);
  return state === undefined ? undefined : getProject(state);
}

export function applyOperationToStore(store: ProjectStore, id: string, operation: unknown): ApplyOutcome {
  const state = store.states.get(id);
  if (!state) return { ok: false, errors: [{ code: 'PROJECT_NOT_FOUND', message: `project not found: ${id}` }] };
  const result = applyEditorOperation(state, operation as Parameters<typeof applyEditorOperation>[1]);
  if (!result.ok) return { ok: false, errors: result.errors };
  store.states.set(id, result.state);
  return { ok: true, project: getProject(result.state) };
}

export function undoInStore(store: ProjectStore, id: string): Project | undefined {
  const state = store.states.get(id);
  if (!state) return undefined;
  const next = undo(state);
  store.states.set(id, next);
  return getProject(next);
}

export function redoInStore(store: ProjectStore, id: string): Project | undefined {
  const state = store.states.get(id);
  if (!state) return undefined;
  const next = redo(state);
  store.states.set(id, next);
  return getProject(next);
}

export function canUndoInStore(store: ProjectStore, id: string): boolean {
  const state = store.states.get(id);
  return state !== undefined && editorCanUndo(state);
}

export function canRedoInStore(store: ProjectStore, id: string): boolean {
  const state = store.states.get(id);
  return state !== undefined && editorCanRedo(state);
}

export async function saveProjectToDisk(store: ProjectStore, id: string, dataDir: string): Promise<string> {
  const project = getProjectFromStore(store, id);
  if (!project) throw new Error(`project not found: ${id}`);
  await mkdir(dataDir, { recursive: true });
  const filePath = join(dataDir, `${id}.json`);
  await writeFile(filePath, serializeProject(project), 'utf8');
  return filePath;
}

export async function loadProjectFromDisk(store: ProjectStore, filePath: string): Promise<Project> {
  const json = await readFile(filePath, 'utf8');
  const result = deserializeProject(json);
  if (!result.ok) {
    throw new Error(`failed to load project: ${result.errors.join('; ')}`);
  }
  const state = loadEditorProject(result.project);
  store.states.set(state.base.id, state);
  return getProject(state);
}
