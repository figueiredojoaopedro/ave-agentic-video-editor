import type { Project } from '../model/index.js';
import { ProjectSchema } from '../model/index.js';

export function serializeProject(project: Project): string {
  const validated = ProjectSchema.parse(project);
  return JSON.stringify(validated, null, 2);
}

export type DeserializeResult =
  | { ok: true; project: Project }
  | { ok: false; errors: string[] };

export function deserializeProject(json: string): DeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { ok: false, errors: [`invalid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const result = ProjectSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  return { ok: true, project: result.data };
}
