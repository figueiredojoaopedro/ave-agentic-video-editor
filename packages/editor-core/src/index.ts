export const EDITOR_CORE_VERSION = '0.1.0';

export * from './model/index.js';
export * from './operations/index.js';
export * from './history/index.js';
export * from './serialization/index.js';
export * from './time.js';
export * from './model/lookup.js';
export {
  applyOperation,
  canRedo,
  canUndo,
  createId,
  createProject,
  getProject,
  loadProject,
  redo,
  saveProject,
  undo,
} from './editor/index.js';
export type { ApplyResult, EditorState } from './editor/index.js';
