import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default('linkedin-automation'),
  MINIO_USE_SSL: z.string().transform(v => v === 'true').default('false'),
  WEBHOOK_SECRET: z.string().min(1),
  MAX_FILE_SIZE: z.coerce.number().default(104857600),
  ALLOWED_MIME_TYPES: z.string().transform(v => v.split(',').map(s => s.trim())),
  CHROMA_URL: z.string().default('http://localhost:8000'),
  KNOWLEDGE_GRAPH_URL: z.string().default('http://localhost:8002'),
  PAGE_ANALYSIS_URL: z.string().default('http://localhost:8003'),
  CONTENT_SERVICE_URL: z.string().default('http://localhost:8004'),
  RENDER_SERVICE_URL: z.string().default('http://localhost:8005'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid env:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
