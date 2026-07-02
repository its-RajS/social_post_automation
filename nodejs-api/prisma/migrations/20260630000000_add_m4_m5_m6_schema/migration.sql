-- Module 4: Add recommended_template to pages
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "recommended_template" VARCHAR(100);

-- Module 5: Posts table
CREATE TABLE IF NOT EXISTS "posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" UUID NOT NULL,
    "doc_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "title" TEXT,
    "subtitle" TEXT,
    "cta" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[],
    "hook_angle" VARCHAR(50),
    "tone" VARCHAR(50),
    "template_id" VARCHAR(100),
    "template_fields" JSONB,
    "context" JSONB,
    "brand_compliance" JSONB,
    "variation_of" UUID,
    "variation_type" VARCHAR(50),
    "image_url" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "posts" ADD CONSTRAINT "posts_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posts" ADD CONSTRAINT "posts_doc_id_fkey"
    FOREIGN KEY ("doc_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Module 5: Post generation jobs
CREATE TABLE IF NOT EXISTS "post_generation_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doc_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "post_id" UUID,
    "status" VARCHAR(50) NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_generation_jobs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "post_generation_jobs" ADD CONSTRAINT "post_generation_jobs_doc_id_fkey"
    FOREIGN KEY ("doc_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Module 6: Render jobs
CREATE TABLE IF NOT EXISTS "render_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'queued',
    "image_url" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
