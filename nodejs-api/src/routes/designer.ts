import { Router } from 'express';
import { z } from 'zod';

import { collectionDateFor, nextReviewStatus, ReviewStatus } from '../domain/designer';
import { prisma } from '../db';
import { AuthenticatedRequest, requireAdmin, requireCsrf } from '../middleware/adminAuth';
import { enqueueFeedback } from '../services/designerQueue';
import { readObject } from '../services/minio';

const router = Router();
router.use(requireAdmin);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get('/posts/:id/image', async (req, res, next) => {
  try {
    const postId = z.string().uuid().parse(req.params.id);
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { imageUrl: true } });
    if (!post?.imageUrl) {
      res.status(404).json({ error: 'Post image not found' });
      return;
    }
    const image = await readObject(post.imageUrl);
    res.type('png').set('Cache-Control', 'private, max-age=300').send(image);
  } catch (error) { next(error); }
});

router.get('/posts', async (req, res, next) => {
  try {
    const date = dateSchema.parse(req.query.date ?? collectionDateFor(new Date()));
    const requestedStatus = req.query.review_status
      ? z.enum(['PENDING', 'APPROVED', 'REJECTED']).parse(req.query.review_status)
      : undefined;
    const posts = await prisma.post.findMany({
      where: {
        collectionDate: new Date(`${date}T00:00:00.000Z`),
        ...(requestedStatus ? { reviewStatus: requestedStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        document: { select: { originalFilename: true } },
        page: { select: { pageNumber: true } },
        publicationItems: { include: { publication: { select: { id: true, state: true } } } },
      },
    });

    const serialized = await Promise.all(posts.map(async (post) => ({
      id: post.id,
      status: post.status,
      review_status: post.reviewStatus,
      feedback_index_status: post.feedbackIndexStatus,
      collection_date: date,
      reviewed_at: post.reviewedAt,
      title: post.title,
      caption: post.caption,
      hashtags: post.hashtags,
      template_id: post.templateId,
      image_url: post.imageUrl ? `/api/v1/designer/posts/${post.id}/image` : null,
      source: { filename: post.document.originalFilename, page_number: post.page.pageNumber },
      context: post.context,
      publication: post.publicationItems
        .map((item) => item.publication)
        .find((publication) => !['FAILED', 'CANCELLED'].includes(publication.state)) ?? null,
    })));
    const counts = serialized.reduce((result, post) => {
      result[post.review_status.toLowerCase() as 'pending' | 'approved' | 'rejected'] += 1;
      if (post.publication?.state === 'PUBLISHED') result.published += 1;
      return result;
    }, { pending: 0, approved: 0, rejected: 0, published: 0 });
    res.json({ date, counts, posts: serialized });
  } catch (error) { next(error); }
});

router.patch('/posts/:id/review', requireCsrf, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { action } = z.object({ action: z.enum(['approve', 'reject', 'undo']) }).parse(req.body);
    const postId = z.string().uuid().parse(req.params.id);
    const updated = await prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        include: { publicationItems: { include: { publication: true } } },
      });
      if (!post) return null;
      const locked = post.publicationItems.some((item) => !['FAILED', 'CANCELLED'].includes(item.publication.state));
      const reviewStatus = nextReviewStatus(post.reviewStatus as ReviewStatus, action, locked);
      return tx.post.update({
        where: { id: post.id },
        data: {
          reviewStatus,
          reviewedAt: reviewStatus === 'PENDING' ? null : new Date(),
          feedbackIndexStatus: 'QUEUED',
        },
      });
    }, { isolationLevel: 'Serializable' });
    if (!updated) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    let feedbackIndexStatus = updated.feedbackIndexStatus;
    try {
      await enqueueFeedback(updated.id);
    } catch (error) {
      await prisma.post.updateMany({
        where: { id: updated.id, reviewStatus: updated.reviewStatus },
        data: { feedbackIndexStatus: 'FAILED' },
      });
      feedbackIndexStatus = 'FAILED';
      console.error('[feedback-enqueue]', error);
    }
    res.json({
      id: updated.id,
      review_status: updated.reviewStatus,
      reviewed_at: updated.reviewedAt,
      feedback_index_status: feedbackIndexStatus,
    });
  } catch (error) { next(error); }
});

router.post('/posts/:id/feedback/retry', requireCsrf, async (req, res, next) => {
  try {
    const postId = z.string().uuid().parse(req.params.id);
    const queued = await prisma.post.updateMany({
      where: { id: postId, feedbackIndexStatus: 'FAILED' },
      data: { feedbackIndexStatus: 'QUEUED' },
    });
    if (queued.count === 0) {
      res.status(409).json({ error: 'Only failed feedback indexing can be retried' });
      return;
    }
    try {
      await enqueueFeedback(postId);
    } catch (error) {
      await prisma.post.update({ where: { id: postId }, data: { feedbackIndexStatus: 'FAILED' } });
      throw error;
    }
    res.status(202).json({ id: postId, feedback_index_status: 'QUEUED' });
  } catch (error) { next(error); }
});

export default router;
