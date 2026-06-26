# LinkedIn Post Automation System

A modular document ingestion and content extraction platform for automated LinkedIn post generation. Module 1 focuses on document upload, intelligent parsing, screenshot generation, and semantic embedding storage.

---

## Project Vision

Transform static documents (PDFs, presentations, articles, images) into structured, searchable content ready for LinkedIn post generation. The system:
- Accepts diverse document formats via a web interface
- Extracts text, tables, images, and layout information using advanced ML models
- Generates page-level screenshots for visual reference
- Creates semantic embeddings for smart content retrieval
- Provides real-time processing status and result browsing

Future modules will handle post generation, scheduling, analytics, and Neo4j knowledge graphs.

---

## Architecture

```mermaid
graph TB
    subgraph Frontend["Frontend Layer (Next.js 15)"]
        Upload["Upload Page<br/>Drag-drop<br/>File selector"]
        DocView["Document View<br/>Live progress<br/>Screenshot grid<br/>Lightbox"]
    end

    subgraph API["API Layer (Node.js/Express)"]
        Endpoints["REST Endpoints<br/>POST /upload<br/>GET /status<br/>GET /pages<br/>GET /events SSE"]
        Queue["Job Queue<br/>BullMQ<br/>Redis producer"]
        Storage["MinIO Client<br/>Screenshot storage"]
    end

    subgraph Worker["Python Worker (FastAPI)"]
        Consumer["BullMQ Consumer<br/>Queue listener"]
        Pipeline["Processing Pipeline<br/>Idempotent design<br/>Retry logic"]
        Docling["Docling 2.5<br/>PDF/DOCX parse<br/>OCR + Layout"]
        Screenshots["Screenshot Gen<br/>pdf2image<br/>LibreOffice<br/>Playwright"]
        Unstructured["Unstructured<br/>Text chunking<br/>Element types"]
        Embeddings["Sentence-Transformers<br/>all-MiniLM-L6-v2<br/>384-dim vectors"]
    end

    subgraph Storage["Storage Layer"]
        PG["PostgreSQL 15<br/>Documents<br/>Pages<br/>Chunks<br/>Processing metadata"]
        Redis["Redis 7<br/>Job queue<br/>Connection pooling"]
        MinIO["MinIO<br/>Raw files<br/>Screenshots<br/>1-hour presigned URLs"]
        Chroma["Chroma<br/>Vector DB<br/>Semantic search"]
    end

    Upload -->|FormData| Endpoints
    Endpoints -->|Job payload| Queue
    Queue -->|Redis job| Consumer
    Consumer -->|Process| Pipeline
    DocView -->|SSE /events| Endpoints
    DocView -->|GET /pages| Endpoints
    
    Pipeline -->|Download| MinIO
    Pipeline -->|Parse| Docling
    Docling -->|Layout| Screenshots
    Screenshots -->|Save| MinIO
    Docling -->|Extract pages| PG
    Screenshots -->|Update pages| PG
    
    Docling -->|Text| Unstructured
    Unstructured -->|Chunks| Embeddings
    Embeddings -->|Vectors| Chroma
    Unstructured -->|Save chunks| PG
    
    Pipeline -->|Webhook| Endpoints
    Endpoints -->|Update status| PG
    
    Endpoints -.->|Query| Redis
    Endpoints -.->|Query| PG
```

---

## Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router, Server/Client Components)
- **Styling:** Tailwind CSS v4 + CSS custom properties
- **Components:** shadcn/ui (Radix primitives)
- **Data:** TanStack Query v5 + native EventSource (SSE)
- **HTTP:** Native fetch + ky wrapper
- **Icons:** lucide-react
- **Toast:** sonner

### API
- **Runtime:** Node.js 24 (Alpine)
- **Framework:** Express.js
- **ORM:** Prisma with PostgreSQL
- **Queue:** BullMQ (Redis-backed)
- **File Storage:** MinIO (AWS S3 compatible)
- **Validation:** Zod
- **Language:** TypeScript

### Python Worker
- **Framework:** FastAPI + uvicorn
- **Document Parsing:** Docling 2.5 (PDF, DOCX, PPTX, images)
- **Text Chunking:** Unstructured 0.16
- **Embeddings:** sentence-transformers (all-MiniLM-L6-v2, 384-dim)
- **Vector DB:** Chroma (HTTP client)
- **Screenshots:** pdf2image, LibreOffice CLI, Playwright
- **OCR:** Tesseract, RapidOCR (Docling integrated)
- **Queue Consumer:** bullmq Python package
- **DB:** SQLAlchemy + psycopg2
- **Language:** Python 3.10

### Infrastructure
- **PostgreSQL 15-alpine:** Relational data (documents, pages, chunks, processing metadata)
- **Redis 7-alpine:** Job queue, connection pooling
- **MinIO:** Object storage for raw files and screenshots
- **Chroma:** Vector database for semantic search
- **Docker Compose:** Local orchestration

---

## Color Palette

Minimalistic, neutral:
- **Background:** `#F8F9FA`
- **Surface:** `#FFFFFF`
- **Border:** `#E9ECEF`
- **Text:** `#212529` (primary), `#6C757D` (muted)
- **Accent:** `#0EA5E9` (one blue, sparingly used)
- **Success:** `#16A34A` (completed)
- **Error:** `#DC2626` (failed)

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 24+ (for frontend dev)
- `git` configured with SSH

### 1. Clone Repository

```bash
git clone git@github.com:its-RajS/social_post_automation.git
cd social_post_automation
```

### 2. Start Infrastructure

```bash
cd automation
docker compose up -d postgres redis minio chroma
# Wait ~10s for health checks
```

### 3. Start API & Worker

```bash
# In automation/ directory
docker compose up -d api python-worker
# api on :3000, worker on :8001 (internal)
```

**Verify API:**
```bash
curl http://localhost:3000/health
# {"ok":true}
```

**Verify Worker:**
```bash
docker logs -f automation-python-worker-1 | grep "uvicorn running"
```

### 4. Start Frontend

```bash
cd automation/frontend
npm install  # First time only
npm run dev -- -p 3001
# http://localhost:3001
```

---

## File Structure

```
automation/
├── docker-compose.yml          # All services
├── .env                        # Runtime secrets (git-ignored)
├── .env.example                # Template
├── .gitignore
├── README.md
│
├── nodejs-api/                 # Express API
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma       # DB schema (Postgres)
│   │   └── migrations/
│   └── src/
│       ├── index.ts            # Express app
│       ├── config.ts           # Zod-validated env
│       ├── db.ts               # Prisma client
│       ├── services/
│       │   ├── minio.ts
│       │   └── queue.ts        # BullMQ producer
│       ├── routes/
│       │   ├── documents.ts    # POST /upload, GET /status, GET /pages
│       │   ├── events.ts       # GET /events (SSE)
│       │   └── webhook.ts      # POST /webhooks/document-processing-complete
│       └── middleware/
│           └── webhookAuth.ts  # Static secret validation
│
├── python-worker/              # FastAPI worker
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                 # FastAPI app + worker startup
│   ├── models/
│   │   └── schemas.py          # Pydantic DTOs
│   └── worker/
│       ├── consumer.py         # BullMQ Worker wiring
│       ├── pipeline.py         # Processing orchestration (idempotent)
│       ├── db.py               # SQLAlchemy ORM + models
│       ├── storage.py          # MinIO boto3 client
│       ├── docling_parser.py   # Docling document conversion
│       ├── screenshot.py       # pdf2image, LibreOffice, Playwright
│       ├── chunker.py          # Unstructured partitioning
│       └── embedder.py         # sentence-transformers + Chroma
│
└── frontend/                   # Next.js 15 frontend
    ├── package.json
    ├── next.config.ts          # API proxy rewrite
    ├── tailwind.config.ts
    ├── components.json         # shadcn config
    ├── app/
    │   ├── layout.tsx          # Root (fonts, providers, toast)
    │   ├── page.tsx            # Upload view
    │   ├── globals.css         # Tailwind + CSS vars
    │   └── documents/[id]/
    │       └── page.tsx        # Document view (Server Component)
    ├── components/
    │   ├── ui/                 # shadcn generated (Button, Badge, Dialog, etc.)
    │   ├── UploadZone.tsx      # Drag-drop + click
    │   ├── ProgressPanel.tsx   # SSE-driven progress
    │   ├── PageGrid.tsx        # Screenshot grid
    │   ├── PageCard.tsx        # Individual page card + icons
    │   ├── PageLightbox.tsx    # Modal lightbox
    │   ├── StatusBadge.tsx     # Status pill badge
    │   ├── CopyButton.tsx      # Copy doc_id
    │   └── Providers.tsx       # QueryClientProvider
    ├── hooks/
    │   ├── useSSE.ts           # EventSource wrapper
    │   └── useDocumentStatus.ts # TanStack Query polling
    └── lib/
        ├── api.ts              # Typed API client
        └── utils.ts            # cn(), formatDuration(), formatBytes()
```

---

## Data Flow

### 1. Upload Phase

```
User selects PDF
  ↓
Frontend POST /api/v1/documents/upload (FormData)
  ↓
API validates file type + size
  ↓
API saves Document row (status=pending)
  ↓
API uploads file to MinIO (raw/{id}/filename)
  ↓
API creates ProcessingJob (status=queued)
  ↓
API enqueues BullMQ job → Redis
  ↓
Frontend receives 202 + doc_id
  ↓
Frontend navigates to /documents/:id
```

### 2. Processing Phase

```
Python Worker polls Redis (bullmq Consumer)
  ↓
Worker receives job (doc_id, storage_path, mime_type)
  ↓
Worker marks Document.status = processing
  ↓
Worker downloads file from MinIO → /tmp/{id}/
  ↓
Docling parses document
  ├─ Extract text, tables, images per page
  ├─ Run OCR if scanned
  ├─ Capture layout (coordinates, item types)
  └─ Generate Page records
  ↓
Screenshot generation (per mime type)
  ├─ PDF → pdf2image
  ├─ PPTX/DOCX → LibreOffice --convert-to pdf → pdf2image
  ├─ Image → Pillow resize
  └─ HTML → Playwright screenshot
  ↓
Upload screenshots to MinIO (screenshots/{id}/page_N.png)
  ↓
Unstructured chunks document by element type
  ↓
sentence-transformers embeds chunks (384-dim vectors)
  ↓
Chroma stores vectors with metadata
  ↓
Insert Chunk records to PostgreSQL (doc_id, page_id, text, vector_db_id)
  ↓
Mark Document.status = completed (total_pages, chunks_count)
  ↓
POST webhook → API with final stats
```

### 3. Result Display Phase

```
Frontend SSE streams from GET /api/v1/documents/:id/events
  ↓
Progress bar updates (screenshots_generated / total_pages)
  ↓
Elapsed timer counts up
  ↓
On status=completed, SSE closes
  ↓
Frontend GET /api/v1/documents/:id/pages
  ↓
Returns array of pages + presigned screenshot URLs
  ↓
Screenshot grid renders with lazy-loading
  ↓
User clicks screenshot → lightbox opens full-res
```

---

## API Endpoints

### Documents

**POST `/api/v1/documents/upload`** (multipart/form-data)
```json
{
  "doc_id": "uuid",
  "status": "pending",
  "message": "File uploaded successfully. Processing started.",
  "uploaded_at": "2026-06-26T15:01:54.158Z",
  "check_status_url": "/api/v1/documents/:id/status"
}
// HTTP 202
```

**GET `/api/v1/documents/:id/status`**
```json
{
  "doc_id": "uuid",
  "status": "pending|processing|completed|failed",
  "progress": {
    "total_pages": 10,
    "screenshots_generated": 5,
    "chunks_created": 42,
    "current_stage": "Generating screenshots…"
  },
  "created_at": "...",
  "updated_at": "..."
}
// HTTP 200
```

**GET `/api/v1/documents/:id/pages`**
```json
{
  "doc_id": "uuid",
  "pages": [
    {
      "page_id": "uuid",
      "page_number": 1,
      "screenshot_url": "http://minio:9000/...?X-Amz-SignedUrl...",
      "text_preview": "Lorem ipsum...",
      "word_count": 450,
      "has_tables": false,
      "has_images": true
    }
  ]
}
// HTTP 200
```

**GET `/api/v1/documents/:id/events`** (Server-Sent Events)
```
Content-Type: text/event-stream

data: {"doc_id":"...","status":"processing","progress":{...}}

data: {"doc_id":"...","status":"completed","progress":{...}}
```

### Webhooks

**POST `/api/v1/webhooks/document-processing-complete`**
- Header: `X-Webhook-Secret: <value from .env>`
- Body: `{"doc_id":"...","status":"completed","total_pages":10,"chunks_count":42}`
- Response: `{"ok":true}` (HTTP 200)
- Auth failure: HTTP 401

---

## Environment Variables

**`.env` template:**

```bash
# Node API
PORT=3000
DATABASE_URL=postgresql://user:pass@postgres:5432/linkedin_automation
REDIS_URL=redis://redis:6379
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
WEBHOOK_SECRET=whsec_change_me_to_random_32chars
OPENAI_API_KEY=sk-...  # Optional, for future embeddings

# Python Worker
REDIS_URL=redis://redis:6379
DATABASE_URL=postgresql://user:pass@postgres:5432/linkedin_automation
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
CHROMA_URL=http://chroma:8000
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
WEBHOOK_URL=http://api:3000/api/v1/webhooks/document-processing-complete
WEBHOOK_SECRET=whsec_change_me_to_random_32chars
MAX_WORKERS=2
QUEUE_NAME=document-processing
```

---

## Key Design Decisions

### 1. **Idempotency**
- Pipeline deletes prior pages (cascades to chunks) before re-inserting on retry
- Unique constraint on `(doc_id, page_number)` prevents duplicates
- Allows safe job retries without manual cleanup

### 2. **Queue Interop**
- Node.js uses BullMQ producer
- Python uses `bullmq` pip package (same Redis protocol)
- Cross-language compatibility without translation layers

### 3. **Server-Sent Events**
- Frontend subscribes to `/events` for real-time progress
- Fallback to TanStack Query polling (3s) if SSE drops
- Auto-closes on terminal state (completed/failed)

### 4. **CPU-Only ML Models**
- `torch==2.4.0+cpu` from PyTorch wheel index (avoids 3GB+ CUDA download)
- `sentence-transformers/all-MiniLM-L6-v2` runs entirely on CPU (384-dim)
- Reduces image size from ~8GB to ~3.5GB

### 5. **Minimalistic UI**
- One accent color (`#0EA5E9`), sparingly used
- Skeleton loading (not spinners) for UX consistency
- Inline error messages (no alert modals)
- Responsive grid: 2-col mobile, 3-col desktop

### 6. **Vector Search Ready**
- Chunks stored in both PostgreSQL (full-text) and Chroma (semantic)
- Metadata includes doc_id, page_id, chunk_type for filtering
- 1-hour presigned URLs from MinIO (security + no auth headers in frontend)

---

## Monitoring & Logs

**API logs:**
```bash
docker compose logs -f api
```

**Worker logs (real-time processing):**
```bash
docker compose logs -f python-worker
```

**All logs:**
```bash
docker compose logs -f
```

**Specific service:**
```bash
docker compose logs --tail=100 postgres
```

---

## Testing End-to-End

1. **Open frontend:** `http://localhost:3001`
2. **Upload PDF:** Drag-drop or select file
3. **Watch progress:** SSE updates status badge + progress bar
4. **View results:** On complete, screenshot grid populates
5. **Click screenshot:** Lightbox opens full-res
6. **Check DB:** 
   ```bash
   docker exec automation-postgres-1 psql -U user linkedin_automation -c "SELECT status, total_pages FROM documents LIMIT 1;"
   ```
7. **Verify MinIO:** `http://localhost:9001` (minioadmin/minioadmin) → browse `screenshots/` bucket
8. **Verify Chroma:** `curl http://localhost:8000/api/v1/collections`

---

## Next Steps (Future Modules)

- **Module 2:** Neo4j knowledge graph (entities, relationships, summaries)
- **Module 3:** Post generation (GPT-4 / Claude, templates, tone variation)
- **Module 4:** Scheduling (LinkedIn API, queue, publish times)
- **Module 5:** Analytics dashboard (impressions, engagement, A/B tests)
- **Module 6:** Multi-account management, content calendar UI

---

## Troubleshooting

**"Connection refused" on API:**
- Ensure `docker compose up -d api` succeeded
- Check `docker compose logs api` for startup errors
- Verify PostgreSQL migration: `docker compose logs api | grep "migrate"`

**"Python worker not processing jobs:**
- Check Redis connection: `docker compose exec redis redis-cli ping`
- Verify worker health: `docker exec automation-python-worker-1 curl localhost:8001/health`
- Check logs: `docker compose logs python-worker`

**"MinIO 403 on screenshot URL:**
- Presigned URL expired (1-hour TTL)
- Regenerate by calling GET `/pages` again
- Check MinIO is healthy: `docker compose logs minio | grep "ready"`

**"Out of memory during document processing:**
- Reduce `MAX_WORKERS` in `.env` (default 2)
- Increase docker container memory limit in `docker-compose.yml`
- Check `docker stats` for usage

---

## License

Internal project for social media automation.

---

**Built with:** Node.js, Python, TypeScript, React, Docling, PostgreSQL, Redis, MinIO, Chroma  
**Last updated:** 2026-06-26
