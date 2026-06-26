import { Queue } from 'bullmq';
import { config } from '../config';

const connection = { url: config.REDIS_URL };

const documentQueue = new Queue('document-processing', { connection });

export interface JobPayload {
  doc_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  uploaded_at: string;
}

export async function enqueueDocument(payload: JobPayload): Promise<string> {
  const job = await documentQueue.add('process', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  });
  return job.id ?? '';
}

export { documentQueue };
