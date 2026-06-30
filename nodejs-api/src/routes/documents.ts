import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { config } from '../config';
import { prisma } from '../db';
import { uploadBuffer, presignedUrl } from '../services/minio';
import { enqueueDocument } from '../services/queue';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (config.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported mime type: ${file.mimetype}`));
    }
  },
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docs = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        originalFilename: true,
        status: true,
        totalPages: true,
        chunksCount: true,
        createdAt: true,
        updatedAt: true,
        processingStage: true,
      },
    });
    res.json({
      documents: docs.map((d) => ({
        id: d.id,
        original_filename: d.originalFilename,
        status: d.status,
        total_pages: d.totalPages,
        chunks_count: d.chunksCount,
        created_at: d.createdAt.toISOString(),
        updated_at: d.updatedAt.toISOString(),
        processing_stage: d.processingStage ?? 'pending',
      })),
      total: docs.length,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const file = req.file;
    const uploadedAt = new Date().toISOString();

    const doc = await prisma.document.create({
      data: {
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: BigInt(file.size),
        storagePath: '',
        status: 'pending',
      },
    });

    const storagePath = `raw/${doc.id}/${file.originalname}`;
    await uploadBuffer(storagePath, file.buffer, file.mimetype);

    await prisma.document.update({
      where: { id: doc.id },
      data: { storagePath },
    });

    const job = await prisma.processingJob.create({
      data: { docId: doc.id, status: 'queued' },
    });

    const queueJobId = await enqueueDocument({
      doc_id: doc.id,
      storage_path: storagePath,
      original_filename: file.originalname,
      mime_type: file.mimetype,
      uploaded_at: uploadedAt,
    });

    await prisma.processingJob.update({
      where: { id: job.id },
      data: { queueJobId },
    });

    res.status(202).json({
      doc_id: doc.id,
      status: 'pending',
      message: 'File uploaded successfully. Processing started.',
      uploaded_at: uploadedAt,
      check_status_url: `/api/v1/documents/${doc.id}/status`,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:doc_id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc_id = req.params['doc_id'] as string;
    const doc = await prisma.document.findUnique({ where: { id: doc_id } });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const pagesCount = await prisma.page.count({ where: { docId: doc_id } });
    const chunksCount = await prisma.chunk.count({ where: { docId: doc_id } });

    res.json({
      doc_id: doc.id,
      status: doc.status,
      progress: {
        total_pages: doc.totalPages ?? pagesCount,
        screenshots_generated: pagesCount,
        chunks_created: doc.chunksCount ?? chunksCount,
        processing_stage: doc.processingStage ?? 'pending',
      },
      created_at: doc.createdAt.toISOString(),
      updated_at: doc.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:doc_id/pages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc_id = req.params['doc_id'] as string;
    const doc = await prisma.document.findUnique({ where: { id: doc_id } });
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const pages = await prisma.page.findMany({
      where: { docId: doc_id },
      orderBy: { pageNumber: 'asc' },
    });

    const pagesWithUrls = await Promise.all(
      pages.map(async (p) => ({
        page_id: p.id,
        page_number: p.pageNumber,
        screenshot_url: p.screenshotUrl ? await presignedUrl(p.screenshotUrl) : null,
        text_preview: p.textContent ? p.textContent.slice(0, 120) : null,
        word_count: p.wordCount,
        has_tables: p.hasTables,
      })),
    );

    res.json({ doc_id, pages: pagesWithUrls });
  } catch (err) {
    next(err);
  }
});

// error handler (multer + async errors)
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.includes('Unsupported mime type')) {
    res.status(415).json({ error: err.message });
    return;
  }
  if (err.message?.includes('File too large') || err.message?.includes('LIMIT_FILE_SIZE')) {
    res.status(413).json({ error: 'File exceeds 100MB limit' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

export default router;
