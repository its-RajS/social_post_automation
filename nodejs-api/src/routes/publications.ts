import { Publication } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { validatePublicationSelection } from '../domain/designer';
import { prisma } from '../db';
import { requireAdmin, requireCsrf } from '../middleware/adminAuth';
import { enqueuePreparation, enqueuePublication } from '../services/designerQueue';
import { readObject } from '../services/minio';

const router = Router();
router.use(requireAdmin);

router.get('/:id/document', async (req, res, next) => {
  try {
    const publicationId = z.string().uuid().parse(req.params.id);
    const publication = await prisma.publication.findUnique({
      where: { id: publicationId }, select: { documentStoragePath: true },
    });
    if (!publication?.documentStoragePath) {
      res.status(404).json({ error: 'Publication document not found' });
      return;
    }
    const document = await readObject(publication.documentStoragePath);
    res.type('pdf').set('Content-Disposition', `inline; filename="publication-${publicationId}.pdf"`)
      .set('Cache-Control', 'private, max-age=300').send(document);
  } catch (error) { next(error); }
});

async function serialize(publication: Publication & { destination?: { label: string; authorUrn: string }; items?: Array<{ position: number; post: { id: string; title: string | null; imageUrl: string | null } }> }) {
  return {
    id: publication.id,
    collection_date: publication.collectionDate.toISOString().slice(0, 10),
    format: publication.format,
    state: publication.state,
    title: publication.title,
    caption: publication.caption,
    hashtags: publication.hashtags,
    document_url: publication.documentStoragePath ? `/api/v1/publications/${publication.id}/document` : null,
    linkedin_post_urn: publication.linkedinPostUrn,
    error_message: publication.errorMessage,
    destination: publication.destination ? {
      label: publication.destination.label, author_urn: publication.destination.authorUrn,
    } : null,
    items: await Promise.all((publication.items ?? []).map(async (item) => ({
      post_id: item.post.id,
      position: item.position,
      title: item.post.title,
      image_url: item.post.imageUrl ? `/api/v1/designer/posts/${item.post.id}/image` : null,
    }))),
    created_at: publication.createdAt,
    published_at: publication.publishedAt,
  };
}

const publicationInclude = {
  destination: { select: { label: true, authorUrn: true } },
  items: { orderBy: { position: 'asc' as const }, include: { post: { select: { id: true, title: true, imageUrl: true } } } },
};

router.post('/prepare', requireCsrf, async (req, res, next) => {
  try {
    const { post_ids } = z.object({ post_ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
    if (new Set(post_ids).size !== post_ids.length) {
      res.status(422).json({ error: 'A post can only be selected once' });
      return;
    }
    const defaultDestination = await prisma.linkedInDestination.findFirst({
      where: { isDefault: true, connection: { isActive: true } },
    });
    if (!defaultDestination) {
      res.status(409).json({ error: 'Connect LinkedIn and configure a default destination first' });
      return;
    }

    let publication = await prisma.$transaction(async (tx) => {
      const found = await tx.post.findMany({
        where: { id: { in: post_ids } },
        include: { publicationItems: { include: { publication: { select: { state: true } } } } },
      });
      const byId = new Map(found.map((post) => [post.id, post]));
      const ordered = post_ids.map((id) => byId.get(id));
      if (ordered.some((post) => !post)) throw new Error('One or more posts were not found');
      const policy = validatePublicationSelection(ordered.map((post) => ({
        id: post!.id,
        reviewStatus: post!.reviewStatus,
        imageUrl: post!.imageUrl,
        collectionDate: post!.collectionDate.toISOString().slice(0, 10),
        locked: post!.publicationItems.some((item) => !['FAILED', 'CANCELLED'].includes(item.publication.state)),
      })));
      return tx.publication.create({
        data: {
          destinationId: defaultDestination.id,
          collectionDate: new Date(`${policy.collectionDate}T00:00:00.000Z`),
          format: policy.format,
          hashtags: [],
          items: { create: post_ids.map((postId, position) => ({ postId, position })) },
        },
        include: publicationInclude,
      });
    }, { isolationLevel: 'Serializable' });

    try {
      await enqueuePreparation(publication.id);
    } catch (error) {
      publication = await prisma.publication.update({
        where: { id: publication.id },
        data: { state: 'FAILED', errorMessage: String(error) },
        include: publicationInclude,
      });
    }
    res.status(202).json(await serialize(publication));
  } catch (error) { next(error); }
});

router.get('/', async (_req, res, next) => {
  try {
    const publications = await prisma.publication.findMany({
      orderBy: { createdAt: 'desc' }, take: 50, include: publicationInclude,
    });
    res.json({ publications: await Promise.all(publications.map(serialize)) });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const publicationId = z.string().uuid().parse(req.params.id);
    const publication = await prisma.publication.findUnique({ where: { id: publicationId }, include: publicationInclude });
    if (!publication) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    res.json(await serialize(publication));
  } catch (error) { next(error); }
});

router.post('/:id/publish', requireCsrf, async (req, res, next) => {
  try {
    const publicationId = z.string().uuid().parse(req.params.id);
    const publication = await prisma.publication.findUnique({ where: { id: publicationId } });
    if (!publication) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    const claimed = await prisma.publication.updateMany({
      where: { id: publication.id, state: 'READY' },
      data: { state: 'PUBLISHING', errorMessage: null },
    });
    if (claimed.count === 0) {
      res.status(409).json({ error: 'Publication is not ready' });
      return;
    }
    try {
      await enqueuePublication(publication.id);
    } catch (error) {
      await prisma.publication.update({
        where: { id: publication.id }, data: { state: 'FAILED', errorMessage: String(error) },
      });
      throw error;
    }
    res.status(202).json({ id: publication.id, state: 'PUBLISHING' });
  } catch (error) { next(error); }
});

router.post('/:id/retry', requireCsrf, async (req, res, next) => {
  try {
    const publicationId = z.string().uuid().parse(req.params.id);
    const retry = await prisma.$transaction(async (tx) => {
      const publication = await tx.publication.findUnique({
        where: { id: publicationId },
        include: {
          items: {
            orderBy: { position: 'asc' },
            include: {
              post: { include: { publicationItems: { include: { publication: { select: { state: true } } } } } },
            },
          },
        },
      });
      if (!publication) return { outcome: 'not_found' as const };
      if (publication.state !== 'FAILED') return { outcome: 'not_failed' as const };
      validatePublicationSelection(publication.items.map((item) => ({
        id: item.post.id,
        reviewStatus: item.post.reviewStatus,
        imageUrl: item.post.imageUrl,
        collectionDate: item.post.collectionDate.toISOString().slice(0, 10),
        locked: item.post.publicationItems.some((reservation) => (
          reservation.publicationId !== publication.id
          && !['FAILED', 'CANCELLED'].includes(reservation.publication.state)
        )),
      })));
      const prepared = Boolean(publication.title && (
        publication.format === 'SINGLE_IMAGE' || publication.documentStoragePath
      ));
      const state = prepared ? 'PUBLISHING' : 'PREPARING';
      await tx.publication.update({
        where: { id: publication.id },
        data: { state, errorMessage: null, submissionStartedAt: null },
      });
      return { outcome: 'claimed' as const, id: publication.id, prepared, state };
    }, { isolationLevel: 'Serializable' });
    if (retry.outcome === 'not_found') {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }
    if (retry.outcome === 'not_failed') {
      res.status(409).json({ error: 'Only failed publications can be retried' });
      return;
    }
    try {
      if (retry.prepared) await enqueuePublication(retry.id);
      else await enqueuePreparation(retry.id);
    } catch (error) {
      await prisma.publication.update({
        where: { id: retry.id }, data: { state: 'FAILED', errorMessage: String(error) },
      });
      throw error;
    }
    res.status(202).json({ id: retry.id, state: retry.state });
  } catch (error) { next(error); }
});

router.post('/:id/cancel', requireCsrf, async (req, res, next) => {
  try {
    const publicationId = z.string().uuid().parse(req.params.id);
    const cancelled = await prisma.publication.updateMany({
      where: {
        id: publicationId,
        OR: [
          { state: { in: ['PREPARING', 'READY', 'FAILED'] } },
          { state: 'PUBLISHING', submissionStartedAt: null },
        ],
      },
      data: { state: 'CANCELLED', errorMessage: null },
    });
    if (cancelled.count === 0) {
      res.status(409).json({ error: 'This publication has already started its LinkedIn submission' });
      return;
    }
    res.json({ id: publicationId, state: 'CANCELLED' });
  } catch (error) { next(error); }
});

router.post('/:id/resolve-verification', requireCsrf, async (req, res, next) => {
  try {
    const publicationId = z.string().uuid().parse(req.params.id);
    const { outcome, linkedin_post_urn } = z.object({
      outcome: z.enum(['published', 'not_published']),
      linkedin_post_urn: z.string().trim().min(1).optional(),
    }).parse(req.body);
    const resolved = await prisma.publication.updateMany({
      where: { id: publicationId, state: 'VERIFICATION_REQUIRED' },
      data: outcome === 'published'
        ? {
          state: 'PUBLISHED', publishedAt: new Date(),
          ...(linkedin_post_urn ? { linkedinPostUrn: linkedin_post_urn } : {}),
          errorMessage: null,
        }
        : { state: 'FAILED', errorMessage: 'Designer confirmed that LinkedIn did not publish the post' },
    });
    if (resolved.count === 0) {
      res.status(409).json({ error: 'This publication does not require verification' });
      return;
    }
    res.json({ id: publicationId, state: outcome === 'published' ? 'PUBLISHED' : 'FAILED' });
  } catch (error) { next(error); }
});

export default router;
