import express from 'express';
import path from 'path';
import { loadConfig } from './server/config';
import { Store } from './server/store';
import { realHttp } from './server/http';
import { firebaseVerifier } from './server/auth';
import { createApp, errorHandler } from './server/app';
import { startScheduler } from './server/scheduler';

let config;
try {
  config = loadConfig();
} catch (e: any) {
  // Only variable names / guidance are printed, never values.
  console.error(e.message);
  process.exit(1);
}

const store = new Store(config.dataDir, config.tokenEncryptionKey);
const app = createApp(config, { store, http: realHttp, verifyToken: firebaseVerifier(config.firebaseProjectId) });

async function start() {
  if (!config.isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.use(errorHandler);

  const scheduler = startScheduler({ http: realHttp, config, store });
  const server = app.listen(config.port, config.host, () => {
    console.log(`SocialSync listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
  });
  const shutdown = () => {
    scheduler.stop();
    server.close(() => store.flush().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
