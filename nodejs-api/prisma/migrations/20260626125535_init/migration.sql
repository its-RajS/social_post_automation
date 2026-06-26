-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'retrying');

-- CreateEnum
CREATE TYPE "ChunkType" AS ENUM ('Title', 'NarrativeText', 'ListItem', 'Table', 'Header', 'Footer', 'ImageCaption');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" BIGINT,
    "storage_path" VARCHAR(500) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "total_pages" INTEGER,
    "chunks_count" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "processing_started_at" TIMESTAMPTZ,
    "processing_completed_at" TIMESTAMPTZ,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doc_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "text_content" TEXT,
    "ocr_text" TEXT,
    "screenshot_url" VARCHAR(500),
    "layout_json" JSONB,
    "has_tables" BOOLEAN NOT NULL DEFAULT false,
    "has_images" BOOLEAN NOT NULL DEFAULT false,
    "has_charts" BOOLEAN NOT NULL DEFAULT false,
    "word_count" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doc_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "chunk_type" "ChunkType" NOT NULL,
    "text" TEXT NOT NULL,
    "bounding_box" JSONB,
    "embedding_model" VARCHAR(100),
    "vector_db_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doc_id" UUID NOT NULL,
    "queue_job_id" VARCHAR(255),
    "worker_id" VARCHAR(255),
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "error_stack" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pages_doc_id_page_number_key" ON "pages"("doc_id", "page_number");

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
