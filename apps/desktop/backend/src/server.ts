import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 43110);

const app = createApp();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`desktop-backend listening on http://127.0.0.1:${PORT}`);
});
