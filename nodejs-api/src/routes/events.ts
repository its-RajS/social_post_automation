import { Router, Request, Response } from 'express';
import { prisma } from '../db';

const router = Router();

router.get('/:doc_id/events', async (req: Request, res: Response) => {
  const doc_id = req.params['doc_id'] as string;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const poll = setInterval(async () => {
    try {
      const doc = await prisma.document.findUnique({ where: { id: doc_id } });
      if (!doc) {
        send({ error: 'Document not found' });
        clearInterval(poll);
        res.end();
        return;
      }

      const pagesCount = await prisma.page.count({ where: { docId: doc_id } });
      const chunksCount = await prisma.chunk.count({ where: { docId: doc_id } });

      send({
        doc_id,
        status: doc.status,
        progress: {
          total_pages: doc.totalPages ?? pagesCount,
          screenshots_generated: pagesCount,
          chunks_created: chunksCount,
        },
      });

      if (doc.status === 'completed' || doc.status === 'failed') {
        clearInterval(poll);
        res.end();
      }
    } catch {
      clearInterval(poll);
      res.end();
    }
  }, 2000);

  req.on('close', () => clearInterval(poll));
});

export default router;
