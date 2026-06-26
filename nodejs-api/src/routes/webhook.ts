import { Router, Request, Response, NextFunction } from 'express';
import { webhookAuth } from '../middleware/webhookAuth';
import { prisma } from '../db';

const router = Router();

router.post('/document-processing-complete', webhookAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      doc_id: string;
      status: 'completed' | 'failed';
      total_pages?: number;
      chunks_count?: number;
      processing_time_seconds?: number;
      error?: string | null;
    };

    const { doc_id, status, total_pages, chunks_count, error } = body;

    const doc = await prisma.document.findUnique({ where: { id: doc_id } });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    await prisma.document.update({
      where: { id: doc_id },
      data: {
        status: status === 'completed' ? 'completed' : 'failed',
        totalPages: total_pages,
        chunksCount: chunks_count,
        processingCompletedAt: new Date(),
        errorMessage: error ?? null,
      },
    });

    await prisma.processingJob.updateMany({
      where: { docId: doc_id },
      data: { status: status === 'completed' ? 'completed' : 'failed' },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
