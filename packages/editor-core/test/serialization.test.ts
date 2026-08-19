import { describe, expect, it } from 'vitest';
import { deserializeProject, serializeProject } from '../src/serialization/project-json.js';
import { makeTestProject } from './helpers.js';

describe('project serialization', () => {
  it('serialize then deserialize produces an equivalent project (spec invariant)', () => {
    const project = makeTestProject();
    const result = deserializeProject(serializeProject(project));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project).toEqual(project);
  });

  it('serialize output is valid JSON and preserves fields', () => {
    const project = makeTestProject();
    const json = serializeProject(project);
    const parsed = JSON.parse(json) as { id: string; schemaVersion: number };
    expect(parsed.id).toBe('project_1');
    expect(parsed.schemaVersion).toBe(1);
  });

  it('rejects malformed JSON', () => {
    const result = deserializeProject('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects JSON that fails schema validation', () => {
    const project = makeTestProject();
    const bad = { ...project, schemaVersion: 99 };
    const result = deserializeProject(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });
});
