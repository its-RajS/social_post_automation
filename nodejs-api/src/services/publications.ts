import { config } from '../config';
import { prisma } from '../db';
import { accessTokenFor, createPost, initializeDocument, initializeImage, LinkedInError, uploadMedia } from './linkedin';
import { readObject } from './minio';

function commentary(caption: string | null, hashtags: string[]): string {
  return [caption?.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n');
}

export async function preparePublication(publicationId: string): Promise<void> {
  try {
    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      include: { items: { orderBy: { position: 'asc' }, include: { post: true } } },
    });
    if (!publication || publication.state !== 'PREPARING') return;

    if (publication.format === 'SINGLE_IMAGE') {
      const post = publication.items[0]?.post;
      if (!post) throw new Error('Publication post not found');
      await prisma.publication.updateMany({
        where: { id: publicationId, state: 'PREPARING' },
        data: {
          title: post.title ?? 'LinkedIn post', caption: post.caption ?? '', hashtags: post.hashtags,
          state: 'READY', errorMessage: null,
        },
      });
      return;
    }

    const postIds = publication.items.map((item) => item.postId);
    const captionResponse = await fetch(`${config.CONTENT_SERVICE_URL}/api/v5/publications/caption`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': config.WEBHOOK_SECRET },
      body: JSON.stringify({ post_ids: postIds }),
    });
    if (!captionResponse.ok) throw new Error(`Combined caption failed: ${captionResponse.status} ${await captionResponse.text()}`);
    const generated = await captionResponse.json() as { title: string; caption: string; hashtags: string[] };

    const imagePaths = publication.items.map((item) => item.post.imageUrl).filter((value): value is string => Boolean(value));
    const pdfResponse = await fetch(`${config.RENDER_SERVICE_URL}/api/v6/publications/pdf`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': config.WEBHOOK_SECRET },
      body: JSON.stringify({ publication_id: publicationId, image_paths: imagePaths }),
    });
    if (!pdfResponse.ok) throw new Error(`PDF preparation failed: ${pdfResponse.status} ${await pdfResponse.text()}`);
    const pdf = await pdfResponse.json() as { storage_path: string };

    await prisma.publication.updateMany({
      where: { id: publicationId, state: 'PREPARING' },
      data: {
        title: generated.title, caption: generated.caption, hashtags: generated.hashtags,
        documentStoragePath: pdf.storage_path, state: 'READY', errorMessage: null,
      },
    });
  } catch (error) {
    const failed = await prisma.publication.updateMany({
      where: { id: publicationId, state: 'PREPARING' }, data: { state: 'FAILED', errorMessage: String(error) },
    });
    if (failed.count > 0) throw error;
  }
}

export async function publishPublication(publicationId: string): Promise<void> {
  try {
    let publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      include: {
        destination: { include: { connection: true } },
        items: { orderBy: { position: 'asc' }, include: { post: true } },
      },
    });
    if (!publication || publication.state !== 'PUBLISHING') return;
    const token = await accessTokenFor(publication.destination.connection);
    let assetUrn = publication.linkedinAssetUrn;

    if (!assetUrn) {
      if (publication.format === 'SINGLE_IMAGE') {
        const path = publication.items[0]?.post.imageUrl;
        if (!path) throw new Error('Rendered image is missing');
        const image = await initializeImage(publication.destination.authorUrn, token);
        await uploadMedia(image.uploadUrl, token, await readObject(path), 'image/png');
        assetUrn = image.urn;
      } else {
        if (!publication.documentStoragePath) throw new Error('Prepared PDF is missing');
        const document = await initializeDocument(publication.destination.authorUrn, token);
        await uploadMedia(document.uploadUrl, token, await readObject(publication.documentStoragePath), 'application/pdf');
        assetUrn = document.urn;
      }
      publication = await prisma.publication.update({
        where: { id: publicationId }, data: { linkedinAssetUrn: assetUrn },
        include: {
          destination: { include: { connection: true } },
          items: { orderBy: { position: 'asc' }, include: { post: true } },
        },
      });
    }

    const submission = await prisma.publication.updateMany({
      where: { id: publicationId, state: 'PUBLISHING', submissionStartedAt: null },
      data: { submissionStartedAt: new Date() },
    });
    if (submission.count === 0) {
      await prisma.publication.updateMany({
        where: { id: publicationId, state: 'PUBLISHING' },
        data: {
          state: 'VERIFICATION_REQUIRED',
          errorMessage: 'A previous LinkedIn submission attempt may have completed; verify it before retrying',
        },
      });
      return;
    }

    const postUrn = await createPost({
      owner: publication.destination.authorUrn,
      token,
      commentary: commentary(publication.caption, publication.hashtags),
      assetUrn,
      format: publication.format,
      title: publication.title ?? 'LinkedIn post',
    });
    try {
      await prisma.publication.updateMany({
        where: { id: publicationId, state: 'PUBLISHING' },
        data: { state: 'PUBLISHED', linkedinPostUrn: postUrn, publishedAt: new Date(), errorMessage: null },
      });
    } catch (error) {
      throw new LinkedInError(`LinkedIn created ${postUrn}, but the local result could not be saved: ${String(error)}`, true);
    }
  } catch (error) {
    const ambiguous = error instanceof LinkedInError && error.ambiguous;
    await prisma.publication.updateMany({
      where: { id: publicationId, state: 'PUBLISHING' },
      data: { state: ambiguous ? 'VERIFICATION_REQUIRED' : 'FAILED', errorMessage: String(error) },
    });
    throw error;
  }
}
