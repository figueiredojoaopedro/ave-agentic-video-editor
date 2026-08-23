import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIService } from './ai-service.js';
import { createApp } from './app.js';
import { createSecretStore, loadKeyringSafely } from './secure-store.js';

const PORT = Number(process.env.PORT ?? 43110);
const dataDir = fileURLToPath(new URL('../.data/projects', import.meta.url));

const keyring = await loadKeyringSafely('agentic-video-editor');
const ai = new AIService({
  secretStore: createSecretStore({
    filePath: join(dataDir, '..', 'secrets.json'),
    ...(keyring ? { keyring } : {}),
  }),
});

const app = createApp({ ai });

app.listen(PORT, '127.0.0.1', () => {
  console.log(`desktop-backend listening on http://127.0.0.1:${PORT} (keyring: ${keyring ? 'available' : 'falling back to file'})`);
});
