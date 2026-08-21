import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KeyringLike {
  set(service: string, account: string, value: string): Promise<void>;
  get(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<void>;
}

export interface SecretStoreOptions {
  /** JSON fallback file path (created on first set) */
  filePath: string;
  /** Optional OS keyring adapter; when present, secrets live in the keyring */
  keyring?: KeyringLike;
}

export function createSecretStore(options: SecretStoreOptions): SecretStore {
  if (options.keyring) {
    return createKeyringSecretStore(options.keyring);
  }
  return createFileSecretStore(options.filePath);
}

/**
 * Attempt to load the OS keyring. Returns undefined when unavailable
 * (e.g. native module blocked by Windows Smart App Control).
 */
export async function loadKeyringSafely(appName: string): Promise<KeyringLike | undefined> {
  try {
    // @napi-rs/keyring@1.x exposes an `AsyncEntry` class (constructor takes
    // `(service, account)`) with camelCase methods setPassword/getPassword/
    // deletePassword — not the assumed v2 `Keyring` class + snake_case API.
    // getPassword resolves to `null` (typed `string | undefined`) when no
    // entry exists; deletePassword on a missing entry resolves to `false`.
    const { AsyncEntry } = (await import('@napi-rs/keyring')) as {
      AsyncEntry: new (service: string, account: string) => KeyringApi;
    };
    return {
      set: (service, account, value) => new AsyncEntry(service, account).setPassword(value),
      get: async (service, account) => (await new AsyncEntry(service, account).getPassword()) ?? null,
      delete: async (service, account) => {
        await new AsyncEntry(service, account).deletePassword();
      },
    };
  } catch {
    return undefined;
  }
}

interface KeyringApi {
  setPassword(password: string, signal?: AbortSignal | null): Promise<void>;
  getPassword(signal?: AbortSignal | null): Promise<string | undefined>;
  deletePassword(signal?: AbortSignal | null): Promise<unknown>;
}

function createKeyringSecretStore(keyring: KeyringLike): SecretStore {
  const service = 'agentic-video-editor';
  return {
    async get(key) {
      const value = await keyring.get(service, key);
      return value ?? undefined;
    },
    async set(key, value) {
      await keyring.set(service, key, value);
    },
    async delete(key) {
      await keyring.delete(service, key);
    },
  };
}

function createFileSecretStore(filePath: string): SecretStore {
  return {
    async get(key) {
      const secrets = await readSecrets(filePath);
      return secrets[key];
    },
    async set(key, value) {
      const secrets = await readSecrets(filePath);
      secrets[key] = value;
      await writeSecrets(filePath, secrets);
    },
    async delete(key) {
      const secrets = await readSecrets(filePath);
      delete secrets[key];
      await writeSecrets(filePath, secrets);
    },
  };
}

async function readSecrets(filePath: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

async function writeSecrets(filePath: string, secrets: Record<string, string>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(secrets, null, 2), 'utf8');
}
