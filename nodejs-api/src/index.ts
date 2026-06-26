import express, { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { ensureBucket } from './services/minio';
import documentsRouter from './routes/documents';
import eventsRouter from './routes/events';
import webhookRouter from './routes/webhook';

const app = express();
app.use(express.json());

app.use('/api/v1/documents', documentsRouter);
app.use('/api/v1/documents', eventsRouter);
app.use('/api/v1/webhooks', webhookRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[global]', err.message);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

async function start() {
  await ensureBucket();
  app.listen(config.PORT, () => {
    console.log(`API running on port ${config.PORT}`);
  });
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
