import express, { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { ensureBucket } from './services/minio';
import documentsRouter from './routes/documents';
import eventsRouter from './routes/events';
import webhookRouter from './routes/webhook';
import authRouter from './routes/auth';
import designerRouter from './routes/designer';
import linkedinRouter from './routes/linkedin';
import publicationsRouter from './routes/publications';
import { DesignerPolicyError } from './domain/designer';
import { ZodError } from 'zod';
import { startDesignerWorkers } from './services/designerQueue';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

app.use('/api/v1/documents', documentsRouter);
app.use('/api/v1/documents', eventsRouter);
app.use('/api/v1/webhooks', webhookRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/designer', designerRouter);
app.use('/api/v1/linkedin', linkedinRouter);
app.use('/api/v1/publications', publicationsRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[global]', err.message);
  if (err instanceof ZodError || err instanceof DesignerPolicyError) {
    res.status(422).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

async function start() {
  await ensureBucket();
  startDesignerWorkers();
  app.listen(config.PORT, () => {
    console.log(`API running on port ${config.PORT}`);
  });
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
