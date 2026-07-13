import { Queue, Worker } from 'bullmq';

import { config } from '../config';
import { prisma } from '../db';
import { preparePublication, publishPublication } from './publications';

const connection = { url: config.REDIS_URL };
export const feedbackQueue = new Queue('designer-feedback', { connection });
export const publicationQueue = new Queue('linkedin-publications', { connection });

export async function enqueueFeedback(postId: string): Promise<void> {
  await feedbackQueue.add('index', { postId }, {
    jobId: `feedback-${postId}-${Date.now()}`,
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
  });
}

export async function enqueuePreparation(publicationId: string): Promise<void> {
  await publicationQueue.add('prepare', { publicationId }, {
    jobId: `prepare-${publicationId}-${Date.now()}`,
    attempts: 1,
  });
}

export async function enqueuePublication(publicationId: string): Promise<void> {
  await publicationQueue.add('publish', { publicationId }, {
    jobId: `publish-${publicationId}-${Date.now()}`,
    attempts: 1,
  });
}

export function startDesignerWorkers(): Worker[] {
  const feedbackWorker = new Worker('designer-feedback', async (job) => {
    const { postId } = job.data as { postId: string };
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { reviewStatus: true } });
    if (!post) return;
    const reviewStatus = post.reviewStatus;
    try {
      const response = await fetch(`${config.CONTENT_SERVICE_URL}/api/v5/feedback/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': config.WEBHOOK_SECRET },
        body: JSON.stringify({ post_id: postId, review_status: reviewStatus }),
      });
      if (!response.ok) throw new Error(`Feedback indexing failed: ${response.status} ${await response.text()}`);
      await prisma.post.updateMany({
        where: { id: postId, reviewStatus }, data: { feedbackIndexStatus: 'INDEXED' },
      });
    } catch (error) {
      await prisma.post.updateMany({
        where: { id: postId, reviewStatus }, data: { feedbackIndexStatus: 'FAILED' },
      });
      throw error;
    }
  }, { connection });

  const publicationWorker = new Worker('linkedin-publications', async (job) => {
    const { publicationId } = job.data as { publicationId: string };
    if (job.name === 'prepare') await preparePublication(publicationId);
    if (job.name === 'publish') await publishPublication(publicationId);
  }, { connection });

  feedbackWorker.on('error', (error) => console.error('[feedback-worker]', error));
  publicationWorker.on('error', (error) => console.error('[publication-worker]', error));
  return [feedbackWorker, publicationWorker];
}
