import { z } from 'zod';

import { DEFAULT_LINKEDIN_SCOPES, parseLinkedInScopes } from './services/linkedinOAuth';

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
  FRONTEND_URL: z.string().default('http://localhost:3001'),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(8).default('change-me-now'),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(8),
  LINKEDIN_CLIENT_ID: z.string().default(''),
  LINKEDIN_CLIENT_SECRET: z.string().default(''),
  LINKEDIN_REDIRECT_URI: z.string().default('http://localhost:3001/api/v1/linkedin/oauth/callback'),
  LINKEDIN_SCOPES: z.string().default(DEFAULT_LINKEDIN_SCOPES.join(' ')).transform(parseLinkedInScopes),
  LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/).default('202606'),
  TOKEN_ENCRYPTION_KEY: z.string().min(32).default('development-only-change-this-key'),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;
  if (!value.ADMIN_PASSWORD_HASH) {
    ctx.addIssue({ code: 'custom', path: ['ADMIN_PASSWORD_HASH'], message: 'Required in production' });
  }
  if (value.TOKEN_ENCRYPTION_KEY === 'development-only-change-this-key') {
    ctx.addIssue({ code: 'custom', path: ['TOKEN_ENCRYPTION_KEY'], message: 'Must be changed in production' });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid env:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
