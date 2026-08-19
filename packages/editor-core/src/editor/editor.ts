import type { Project } from '../model/index.js';
import { EditOperationSchema, type EditOperation } from '../operations/index.js';
import type { OperationError } from '../operations/validate.js';
import { validateOperation } from '../operations/validate.js';
import {
  appendOperation,
  canRedo,
  canUndo,
  createEditorState,
  createEmptyProject,
  getProject,
  redo,
  undo,
  type EditorState,
} from '../history/editor-state.js';
import { createId } from '../ids.js';

export type ApplyResult =
  | { ok: true; errors: []; state: EditorState }
  | { ok: false; errors: OperationError[]; state?: never };

export { canRedo, canUndo, getProject, redo, undo };
export type { EditorState };

export function createProject(name: string): EditorState {
  return createEditorState(createEmptyProject(name));
}

export function loadProject(project: Project): EditorState {
  return createEditorState(project);
}

export function saveProject(state: EditorState): Project {
  return getProject(state);
}

export function applyOperation(state: EditorState, operation: EditOperation): ApplyResult {
  const parsed = EditOperationSchema.safeParse(operation);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_OPERATION',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      ],
    };
  }
  const validation = validateOperation(getProject(state), operation);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  return { ok: true, errors: [], state: appendOperation(state, operation) };
}

export { createId };
