import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSecretStore, type KeyringLike } from '../src/secure-store.js';

describe('secure-store', () => {
  const dirs: string[] = [];

  function tempFile(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ave-secrets-'));
    dirs.push(dir);
    return join(dir, 'secrets.json');
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('file store round-trips and deletes secrets', async () => {
    const store = createSecretStore({ filePath: tempFile() });
    await store.set('ai.apiKey', 'sk-secret');
    await expect(store.get('ai.apiKey')).resolves.toBe('sk-secret');
    await store.delete('ai.apiKey');
    await expect(store.get('ai.apiKey')).resolves.toBeUndefined();
  });

  it('file store returns undefined for a missing key', async () => {
    const store = createSecretStore({ filePath: tempFile() });
    await expect(store.get('nope')).resolves.toBeUndefined();
  });

  it('file store persists across instances', async () => {
    const filePath = tempFile();
    await createSecretStore({ filePath }).set('ai.apiKey', 'sk-1');
    await expect(createSecretStore({ filePath }).get('ai.apiKey')).resolves.toBe('sk-1');
  });

  it('keyring store delegates to the keyring', async () => {
    const map = new Map<string, string>();
    const keyring: KeyringLike = {
      set: async (service, account, value) => {
        map.set(`${service}:${account}`, value);
      },
      get: async (service, account) => map.get(`${service}:${account}`) ?? null,
      delete: async (service, account) => {
        map.delete(`${service}:${account}`);
      },
    };
    const store = createSecretStore({ filePath: tempFile(), keyring });
    await store.set('ai.apiKey', 'sk-2');
    await expect(store.get('ai.apiKey')).resolves.toBe('sk-2');
    expect(map.size).toBe(1);
  });

  it('recovers from a corrupted fallback file', async () => {
    const filePath = tempFile();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(filePath, '{{{ not json', 'utf8');
    const store = createSecretStore({ filePath });
    await store.set('ai.apiKey', 'sk-3');
    await expect(store.get('ai.apiKey')).resolves.toBe('sk-3');
  });
});
