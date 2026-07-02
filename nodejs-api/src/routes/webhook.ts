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

    if (status === 'completed') {
      const KG_URL = process.env.KNOWLEDGE_GRAPH_URL ?? 'http://localhost:8002';
      const PA_URL = process.env.PAGE_ANALYSIS_URL ?? 'http://localhost:8003';
      void Promise.all([
        fetch(`${KG_URL}/api/v2/graph/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_id }),
        }).catch((e: Error) => console.error('[auto-trigger] KG failed:', e.message)),
        fetch(`${PA_URL}/api/v3/pages/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_id }),
        }).catch((e: Error) => console.error('[auto-trigger] PA failed:', e.message)),
      ]);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/graph-build-complete', webhookAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { doc_id, job_id, status, error } = req.body as {
      doc_id: string;
      job_id: string;
      status: 'completed' | 'failed';
      error?: string | null;
    };

    const job = await prisma.knowledgeGraphJob.findUnique({ where: { id: job_id } });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    await prisma.knowledgeGraphJob.update({
      where: { id: job_id },
      data: { status, error: error ?? null },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/page-analysis-complete', webhookAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { doc_id, job_id, status, selected_pages, error } = req.body as {
      doc_id: string;
      job_id: string;
      status: 'completed' | 'failed';
      selected_pages?: number;
      error?: string | null;
    };

    const job = await prisma.pageAnalysisJob.findUnique({ where: { id: job_id } });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    await prisma.pageAnalysisJob.update({
      where: { id: job_id },
      data: { status, error: error ?? null },
    });

    // Auto-trigger Module 5: generate posts for each selected page
    if (status === 'completed') {
      const CONTENT_URL = process.env.CONTENT_SERVICE_URL ?? 'http://content-service:8004';
      const selectedPages = await prisma.page.findMany({
        where: { docId: doc_id, selectedForPost: true },
        select: { id: true },
      });
      void Promise.all(
        selectedPages.map((p) =>
          fetch(`${CONTENT_URL}/api/v5/posts/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc_id, page_id: p.id }),
          }).catch((e: Error) => console.error('[auto-trigger] Content gen failed:', e.message)),
        ),
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/content-generated', webhookAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { doc_id, page_id, job_id, post_id, status, error } = req.body as {
      doc_id: string;
      page_id: string;
      job_id: string;
      post_id?: string;
      status: 'completed' | 'failed';
      error?: string | null;
    };

    const job = await prisma.postGenerationJob.findUnique({ where: { id: job_id } });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    await prisma.postGenerationJob.update({
      where: { id: job_id },
      data: { status, error: error ?? null, ...(post_id ? { postId: post_id } : {}) },
    });

    // Note: render (Module 6) is already auto-triggered by content-service itself
    // (worker/pipeline.py _trigger_render), no separate trigger needed here.

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
