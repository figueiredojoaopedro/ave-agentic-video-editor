import type { EditOperation, OperationError, Project } from '@agentic-video-editor/editor-core';

export interface ApplyOutcome {
  ok: boolean;
  errors?: OperationError[];
  project?: Project;
}

/** The surface the agent uses to read and edit the timeline — implemented by the backend against the project store. */
export interface AgentContext {
  getProject(): Project;
  applyOperation(operation: EditOperation): ApplyOutcome;
  undo(): Project | undefined;
  redo(): Project | undefined;
}
